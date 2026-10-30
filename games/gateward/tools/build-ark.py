"""Build Gateward's editable capital-ship asset in an isolated Blender scene.

Run ``build_ark(output_dir)`` from Blender's Python console or execute this file
with ``blender --background --python build-ark.py -- --gateward-export DIR``.
The asset uses Blender X forward, -Y starboard, Z up. Blender's glTF Y-up export
therefore maps each gameplay point to Three.js (x, height, across).

Only datablocks tagged by this builder are replaced. The user's active scene,
current file, selection, and unrelated objects are preserved.
"""

from __future__ import annotations

import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Euler, Vector


OWNER_KEY = "gateward_asset_builder"
OWNER_VALUE = "capital-ship-v1"

SECTION = (
	(-24.0, 19.5), (24.0, 19.5), (62.0, 13.0), (79.0, -3.0),
	(76.0, -28.0), (55.0, -55.0), (20.0, -70.0), (-20.0, -70.0),
	(-55.0, -55.0), (-76.0, -28.0), (-79.0, -3.0), (-62.0, 15.0),
)

# Nominal X, beam scale, vertical scale, lower-prow rake. The bow is a clipped,
# faceted cap rather than the tip of an ellipsoid or a waterline-shaped keel.
STATIONS = (
	(-270.0, 0.83, 0.88, 0.0), (-244.0, 1.0, 1.0, 0.0),
	(-170.0, 1.0, 1.0, 0.0), (-88.0, 1.0, 1.0, 0.0),
	(-5.0, 1.0, 1.0, 0.0), (78.0, 0.99, 1.0, 0.0),
	(162.0, 0.97, 0.98, 0.04), (238.0, 0.80, 0.92, 0.22),
	(284.0, 0.60, 0.82, 0.38), (302.0, 0.40, 0.72, 0.48),
)

ARMOR_SPANS = (
	(-243.0, -174.0), (-170.0, -101.0), (-97.0, -28.0),
	(-24.0, 45.0), (49.0, 118.0), (122.0, 190.0),
	(194.0, 244.0), (248.0, 282.0), (286.0, 301.0),
)


def _tag(datablock):
	datablock[OWNER_KEY] = OWNER_VALUE
	return datablock


def _owned(datablock):
	return datablock.get(OWNER_KEY) == OWNER_VALUE


def _remove_previous_build():
	"""Remove only assets previously made by this exact builder."""
	for obj in tuple(bpy.data.objects):
		if _owned(obj):
			bpy.data.objects.remove(obj, do_unlink=True)
	for scene in tuple(bpy.data.scenes):
		if _owned(scene) and not scene.objects:
			bpy.data.scenes.remove(scene)
	for collection in tuple(bpy.data.collections):
		if _owned(collection) and not collection.objects and not collection.children:
			bpy.data.collections.remove(collection)
	for group in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
		for datablock in tuple(group):
			if _owned(datablock) and datablock.users == 0:
				group.remove(datablock)


def _enum(owner, property_name, desired):
	items = owner.bl_rna.properties[property_name].enum_items
	identifiers = {item.identifier for item in items}
	if desired not in identifiers:
		raise RuntimeError(f"{property_name} lacks {desired}; available: {sorted(identifiers)}")
	return desired


def _operator_enum(operator, property_name, desired):
	"""Resolve dynamic operator enums, which Blender 5.2 RNA may omit."""
	rna = operator.get_rna_type()
	prop = rna.properties[property_name]
	identifiers = {item.identifier for item in prop.enum_items}
	identifiers.update(item.identifier for item in prop.enum_items_static)
	if not identifiers:
		operator_type = getattr(bpy.types, rna.identifier)
		for owner in operator_type.__mro__:
			annotation = owner.__dict__.get("__annotations__", {}).get(property_name)
			metadata = getattr(annotation, "keywords", {})
			items = metadata.get("items")
			if callable(items):
				items = items(None, bpy.context)
			if items:
				identifiers.update(item[0] for item in items if item)
	if desired not in identifiers:
		raise RuntimeError(f"{property_name} lacks {desired}; available: {sorted(identifiers)}")
	return next(value for value in identifiers if value == desired)


def _socket(node, identifier):
	for socket in node.inputs:
		if socket.identifier == identifier:
			return socket
	raise RuntimeError(f"Missing shader input {identifier}")


def _material(name, color, roughness=0.72, metalness=0.42, emission=None):
	mat = _tag(bpy.data.materials.new(name))
	mat.use_backface_culling = True
	mat.use_nodes = True
	shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
	_socket(shader, "Base Color").default_value = (*color, 1.0)
	_socket(shader, "Metallic").default_value = metalness
	_socket(shader, "Roughness").default_value = roughness
	if emission is not None:
		_socket(shader, "Emission Color").default_value = (*emission[0], 1.0)
		_socket(shader, "Emission Strength").default_value = emission[1]
	return mat


def _materials():
	return {
		"core": _material("Gateward_Core", (0.055, 0.068, 0.081)),
		"armor": _material("Gateward_Armor", (0.20, 0.225, 0.25)),
		"plate": _material("Gateward_Plate", (0.245, 0.265, 0.285)),
		"shadow": _material("Gateward_ShadowArmor", (0.125, 0.15, 0.175)),
		"edge": _material("Gateward_Edge", (0.33, 0.355, 0.375), 0.64),
		"recess": _material("Gateward_Recess", (0.012, 0.021, 0.028), 0.9, 0.2),
		"window": _material("Gateward_Window", (0.27, 0.16, 0.055), emission=((0.95, 0.57, 0.20), 1.8)),
		"drive": _material("Gateward_Drive", (0.55, 0.35, 0.15), emission=((1.0, 0.72, 0.38), 3.2)),
	}


class MeshBatch:
	"""Accumulate disconnected solid details into one draw per material."""

	def __init__(self):
		self.vertices = []
		self.faces = []

	def mesh(self, vertices, faces):
		offset = len(self.vertices)
		self.vertices.extend(tuple(float(value) for value in vertex) for vertex in vertices)
		self.faces.extend(tuple(offset + index for index in face) for face in faces)

	def box(self, center, size, rotation=(0.0, 0.0, 0.0)):
		matrix = Euler(rotation).to_matrix()
		sx, sy, sz = (value / 2.0 for value in size)
		local = (
			(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
			(-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz),
		)
		vertices = [Vector(center) + matrix @ Vector(vertex) for vertex in local]
		self.mesh(vertices, ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)))

	def loft(self, rings, cap_end=True):
		count = len(rings[0])
		vertices = [point for ring in rings for point in ring]
		faces = [tuple(range(count))]
		for ring_index in range(len(rings) - 1):
			old = ring_index * count
			new = (ring_index + 1) * count
			for index in range(count):
				next_index = (index + 1) % count
				faces.append((old + index, new + index, new + next_index, old + next_index))
		if cap_end:
			faces.append(tuple(reversed(range((len(rings) - 1) * count, len(rings) * count))))
		self.mesh(vertices, faces)

	def beveled_quad(self, points, height=2.0, inset=0.055):
		vectors = [Vector(point) for point in points]
		normal = (vectors[1] - vectors[0]).cross(vectors[2] - vectors[0]).normalized()
		center = sum(vectors, Vector()) / 4.0
		roof = [center + (point - center) * (1.0 - inset) + normal * height for point in vectors]
		self.mesh(vectors + roof, ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)))

	def frustum(self, bottom, top, z_bottom, z_top):
		count = len(bottom)
		vertices = [(x, y, z_bottom) for x, y in bottom] + [(x, y, z_top) for x, y in top]
		faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
		for index in range(count):
			next_index = (index + 1) % count
			faces.append((index, next_index, count + next_index, count + index))
		self.mesh(vertices, faces)

	def object(self, name, collection, material, parent=None):
		mesh = _tag(bpy.data.meshes.new(f"{name}_Mesh"))
		mesh.from_pydata(self.vertices, [], self.faces)
		mesh.validate(clean_customdata=False)
		editable = bmesh.new()
		editable.from_mesh(mesh)
		bmesh.ops.recalc_face_normals(editable, faces=tuple(editable.faces))
		editable.to_mesh(mesh)
		editable.free()
		mesh.update(calc_edges=True)
		mesh.materials.append(material)
		obj = _tag(bpy.data.objects.new(name, mesh))
		collection.objects.link(obj)
		obj.parent = parent
		return obj


def _station_at(x):
	for start, end in zip(STATIONS, STATIONS[1:]):
		if x <= end[0]:
			fraction = min(1.0, max(0.0, (x - start[0]) / (end[0] - start[0])))
			return tuple(a + (b - a) * fraction for a, b in zip(start[1:], end[1:]))
	return STATIONS[-1][1:]


def _point(x, y, z):
	beam, height, rake = _station_at(x)
	adjusted_z = -19.0 + (z + 19.0) * height
	top_z = -19.0 + 38.5 * height
	return (x + rake * (adjusted_z - top_z), y * beam, adjusted_z)


def _footprint(x_min, x_max, y_min, y_max, bevel=4.0):
	return (
		(x_min + bevel, y_min), (x_max - bevel, y_min),
		(x_max, y_min + bevel), (x_max, y_max - bevel),
		(x_max - bevel, y_max), (x_min + bevel, y_max),
		(x_min, y_max - bevel), (x_min, y_min + bevel),
	)


def _body(batches):
	rings = [[_point(station[0], y, z) for y, z in SECTION] for station in STATIONS]
	batches["core"].loft(rings, cap_end=False)
	# Close the raked bow with solid armor rather than leaving a dark core cap.
	# Its profile is shared with the core, so neither dimensions nor silhouette move.
	front = list(reversed(rings[-1]))
	batches["armor"].mesh(front, (tuple(range(len(front))),))
	for row, z in enumerate((4.0, -22.0, -44.0)):
		for column, y in enumerate((-43.0, 0.0, 43.0)):
			points = (
				_point(302.0, y - 15.0, z + 5.0), _point(302.0, y - 15.0, z - 5.0),
				_point(302.0, y + 15.0, z - 5.0), _point(302.0, y + 15.0, z + 5.0),
			)
			batches["plate" if (row + column) % 3 == 0 else "armor"].beveled_quad(points, height=1.0, inset=0.09)
	waist = (
		_point(302.0, -66.0, -7.0), _point(302.0, -66.0, -13.0),
		_point(302.0, 66.0, -13.0), _point(302.0, 66.0, -7.0),
	)
	batches["recess"].beveled_quad(waist, height=0.35, inset=0.025)
	for y in (-53.0, -35.0, -17.0, 1.0, 19.0, 37.0, 55.0):
		x, across, z = _point(302.0, y, -10.0)
		batches["window"].box((x + 0.6, across, z - 0.2), (0.5, 1.7, 0.8))
	upper_faces = (0, 1, 2, 10, 11)
	lower_faces = (4, 5, 6, 7, 8)
	for span_index, (start, end) in enumerate(ARMOR_SPANS):
		for face_index in upper_faces + lower_faces:
			y0, z0 = SECTION[face_index]
			y1, z1 = SECTION[(face_index + 1) % len(SECTION)]
			material = "plate" if (span_index + face_index) % 4 == 0 else "armor"
			if face_index in (5, 6, 7):
				material = "shadow"
			points = (_point(start, y0, z0), _point(end, y0, z0), _point(end, y1, z1), _point(start, y1, z1))
			batches[material].beveled_quad(points, height=2.2, inset=0.045)
	# Narrow circumferential seams interrupt the waist and link upper/lower armor.
	for x in (-244.0, -172.0, -99.0, -26.0, 47.0, 120.0, 192.0, 246.0, 284.0):
		for face_index in range(len(SECTION)):
			y0, z0 = SECTION[face_index]
			y1, z1 = SECTION[(face_index + 1) % len(SECTION)]
			batches["edge"].beveled_quad((_point(x - 1.6, y0, z0), _point(x + 1.6, y0, z0), _point(x + 1.6, y1, z1), _point(x - 1.6, y1, z1)), 2.8, 0.08)
	# Irregular access panels and shallow layered armor give each segment scale.
	for index, x in enumerate(range(-233, 258, 17)):
		length = 8.0 + (index % 3) * 3.0
		for face_index in (0, 1, 2, 10, 11):
			y0, z0 = SECTION[face_index]
			y1, z1 = SECTION[(face_index + 1) % len(SECTION)]
			low = 0.17 if index % 2 else 0.53
			high = min(0.91, low + 0.25)
			pa = (y0 + (y1 - y0) * low, z0 + (z1 - z0) * low)
			pb = (y0 + (y1 - y0) * high, z0 + (z1 - z0) * high)
			material = "recess" if (index + face_index) % 5 == 0 else "shadow" if index % 3 else "plate"
			batches[material].beveled_quad((_point(x, *pa), _point(x + length, *pa), _point(x + length, *pb), _point(x, *pb)), 3.0, 0.1)
	for side in (-1.0, 1.0):
		for index, x in enumerate(range(-239, 264, 9)):
			if index % 7 in (0, 1):
				continue
			batches["window"].box(_point(x, side * 79.0, -11.5), (2.6, 0.8, 1.0))
			if index % 3 == 0:
				batches["window"].box(_point(x, side * 55.2, -54.2), (2.0, 0.8, 0.8))
		# Armored side sponsons share the faceted body, with inset mechanical slots.
		for x in (-188.0, -58.0, 75.0, 189.0):
			cy = side * (74.0 * _station_at(x)[0])
			foot = _footprint(x - 17.0, x + 17.0, cy - 8.0, cy + 8.0, 4.0)
			roof = _footprint(x - 14.0, x + 14.0, cy - 7.0, cy + 7.0, 3.0)
			batches["shadow"].frustum(foot, roof, -25.0, -4.0)
			batches["plate"].box((x, cy + side * 8.1, -11.0), (20.0, 1.2, 9.0))
			for dx in (-6.0, 0.0, 6.0):
				batches["recess"].box((x + dx, cy + side * 8.8, -11.0), (2.0, 0.5, 5.0))


def _bridge(batches):
	# Low terraced spine integrates the command block into the upper armor.
	for material, bounds, bottom, top in (
		("shadow", (-246, 73, -24, 24), 24, 30),
		("armor", (-231, -106, -27, 27), 30, 36),
		("plate", (-222, -139, -23, 23), 36, 43),
		("armor", (-116, -50, -17, 17), 30, 36),
	):
		shape = _footprint(*bounds, bevel=6.0)
		batches[material].frustum(shape, shape, bottom, top)
	# The main tower is an angular, buttressed block with wide bridge galleries.
	batches["armor"].frustum(_footprint(-216, -148, -24, 24, 6), _footprint(-196, -161, -13, 13, 4), 43, 74)
	wing = _footprint(-217, -139, -31, 31, 7)
	batches["edge"].frustum(wing, wing, 74, 81)
	batches["shadow"].frustum(_footprint(-199, -157, -17, 17, 4), _footprint(-192, -162, -12, 12, 3), 81, 90)
	cap = _footprint(-206, -150, -23, 23, 5)
	batches["plate"].frustum(cap, cap, 90, 94)
	for side in (-1, 1):
		batches["recess"].box((-179, side * 31.1, 78), (60, 0.6, 2.5))
		batches["recess"].box((-178, side * 23.1, 92), (44, 0.6, 1.7))
		for x in range(-204, -147, 7):
			batches["window"].box((x, side * 31.5, 78), (2.6, 0.5, 1.0))
		for x in range(-198, -154, 7):
			batches["window"].box((x, side * 23.5, 92), (2.2, 0.5, 0.8))
	batches["recess"].box((-138.9, 0, 78), (0.7, 40, 2.5))
	for y in range(-17, 19, 6):
		batches["window"].box((-138.4, y, 78), (0.5, 2.0, 1.0))
	# Tapered flying braces support the bridge galleries.
	for side in (-1, 1):
		batches["edge"].box((-151, side * 19, 56), (3.2, 3.0, 38), (0, math.radians(-24), 0))
	# Secondary communications structures break the aft skyline into smaller steps.
	batches["armor"].frustum(_footprint(-244, -219, -14, 14, 4), _footprint(-239, -224, -9, 9, 3), 30, 49)
	batches["plate"].box((-231.5, 0, 52), (30, 27, 5))
	batches["shadow"].box((-231.5, 0, 62), (9, 9, 16))
	batches["edge"].box((-231.5, 0, 80), (1.5, 1.5, 22))
	batches["armor"].frustum(_footprint(-130, -100, -13, 13, 4), _footprint(-122, -106, -7, 7, 2), 36, 49)
	batches["plate"].box((-114, 0, 51), (31, 26, 4))
	batches["edge"].box((-114, 0, 61), (2.0, 2.0, 17))
	for x, y, top in ((-190, -6, 115), (-179, 5, 110), (-165, -4, 106)):
		batches["edge"].box((x, y, (94 + top) / 2), (1.0, 1.0, top - 94))
	# Aft heat exchangers and scattered axial equipment remain below the mounts.
	for x in (-252, -122, -31, 23):
		batches["shadow"].box((x, 0, 32), (20, 22, 4))
		for y in (-7, -2, 3, 8):
			batches["recess"].box((x, y, 34.3), (15, 1.7, 0.8))


def _mounts(collection, root, materials):
	# All eight sockets retain the current gameplay positions and Y-up heights.
	pad = MeshBatch()
	sides = 16
	bottom = [(17 * math.cos(i * math.tau / sides), 17 * math.sin(i * math.tau / sides), -4.0) for i in range(sides)]
	upper = [(17 * math.cos(i * math.tau / sides), 17 * math.sin(i * math.tau / sides), -1.0) for i in range(sides)]
	inner = [(14.5 * math.cos(i * math.tau / sides), 14.5 * math.sin(i * math.tau / sides), 0.0) for i in range(sides)]
	vertices = bottom + upper + inner
	faces = [tuple(reversed(range(sides))), tuple(range(sides * 2, sides * 3))]
	for index in range(sides):
		next_index = (index + 1) % sides
		faces.append((index, next_index, sides + next_index, sides + index))
		faces.append((sides + index, sides + next_index, sides * 2 + next_index, sides * 2 + index))
	pad.mesh(vertices, faces)
	shared_mesh = None
	for index in range(8):
		point = (-96, -32, 32, 96)[index % 4]
		across = -43 if index < 4 else 43
		anchor = _tag(bpy.data.objects.new(f"Mount_{index + 1:02d}", None))
		collection.objects.link(anchor)
		anchor.parent = root
		anchor.location = (point, -across, 22)
		anchor["mount_index"] = index
		if shared_mesh is None:
			obj = pad.object(f"Pad_{index + 1:02d}", collection, materials["shadow"], anchor)
			shared_mesh = obj.data
		else:
			obj = _tag(bpy.data.objects.new(f"Pad_{index + 1:02d}", shared_mesh))
			collection.objects.link(obj)
			obj.parent = anchor
		obj["mount_index"] = index
		obj["is_mount_pad"] = True


def _drives(batches, collection, root, materials):
	for index, (y, z) in enumerate(((-31, -12), (31, -12), (-31, -46), (31, -46)), 1):
		section = ((-12, 15), (12, 15), (18, 9), (18, -9), (12, -15), (-12, -15), (-18, -9), (-18, 9))
		batches["shadow"].loft([[(x, y + dy, z + dz) for dy, dz in section] for x in (-299, -267)])
		batches["edge"].loft([[(x, y + dy, z + dz) for dy, dz in section] for x in (-299.7, -297.7)])
		# A dark inner well surrounds a separately addressable emissive aperture.
		batches["recess"].box((-300.1, y, z), (0.8, 26, 20))
		aperture = MeshBatch()
		aperture.box((0, 0, 0), (0.6, 20, 14))
		obj = aperture.object(f"Drive_{index:02d}", collection, materials["drive"], root)
		obj.location = (-300.7, y, z)
		obj["drive_index"] = index - 1
		for dy in (-5, 0, 5):
			batches["edge"].box((-301.1, y + dy, z), (0.5, 0.8, 14.5))


def _presentation(scene, collection):
	world = _tag(bpy.data.worlds.new("Gateward_PreviewWorld"))
	world.use_nodes = True
	background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
	_socket(background, "Color").default_value = (0.025, 0.035, 0.055, 1.0)
	_socket(background, "Strength").default_value = 0.35
	scene.world = world
	camera_data = _tag(bpy.data.cameras.new("Gateward_PreviewCamera"))
	camera_data.type = _enum(camera_data, "type", "ORTHO")
	camera_data.ortho_scale = 760
	camera_data.clip_start = 1
	camera_data.clip_end = 5000
	camera = _tag(bpy.data.objects.new("Gateward_PreviewCamera", camera_data))
	collection.objects.link(camera)
	camera.location = (670, -690, 570)
	camera.rotation_euler = (Vector((0, 0, -4)) - camera.location).to_track_quat("-Z", "Y").to_euler()
	scene.camera = camera
	for name, position, energy, color in (
		("Key", (80, -260, 420), 2400000, (0.86, 0.92, 1.0)),
		("Fill", (-230, 180, 200), 1300000, (0.58, 0.73, 1.0)),
		("Rim", (210, 230, 70), 1800000, (1.0, 0.80, 0.58)),
	):
		types = bpy.types.BlendDataLights.bl_rna.functions["new"].parameters["type"].enum_items
		area_type = next(item.identifier for item in types if item.identifier == "AREA")
		data = _tag(bpy.data.lights.new(f"Gateward_{name}", area_type))
		data.energy = energy
		data.color = color
		data.shape = _enum(data, "shape", "DISK")
		data.size = 300
		light = _tag(bpy.data.objects.new(f"Gateward_{name}", data))
		collection.objects.link(light)
		light.location = position
		light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()
	scene.render.resolution_x = 1280
	scene.render.resolution_y = 900
	scene.render.resolution_percentage = 100


def build_ark(output_dir):
	"""Create the ship, export only its hierarchy, and write an editable blend copy.

	Returns JSON-serializable paths, counts and bounds. Does not change the active
	window scene or the user's open .blend filename. The dedicated scene is named
	Gateward_Asset for inspection; previews are excluded from the GLB.
	"""
	output = Path(output_dir).expanduser().resolve()
	output.mkdir(parents=True, exist_ok=True)
	_remove_previous_build()
	for required in ("Gateward_Ark", *(f"Mount_{index:02d}" for index in range(1, 9))):
		if bpy.data.objects.get(required) is not None:
			raise RuntimeError(f"Preserving unrelated object with reserved name {required}")
	scene = _tag(bpy.data.scenes.new("Gateward_Asset"))
	collection = _tag(bpy.data.collections.new("Gateward_Model"))
	preview = _tag(bpy.data.collections.new("Gateward_Presentation"))
	scene.collection.children.link(collection)
	scene.collection.children.link(preview)
	root = _tag(bpy.data.objects.new("Gateward_Ark", None))
	collection.objects.link(root)
	root["asset_version"] = 1
	root["coordinate_system"] = "Blender X-forward, -Y-starboard, Z-up; glTF Y-up"
	materials = _materials()
	batches = defaultdict(MeshBatch)
	_body(batches)
	_bridge(batches)
	_drives(batches, collection, root, materials)
	for material, batch in batches.items():
		if batch.vertices:
			batch.object(f"Ark_{material.title()}", collection, materials[material], root)
	_mounts(collection, root, materials)
	_presentation(scene, preview)
	view_layer = scene.view_layers[0]
	view_layer.update()
	for obj in collection.objects:
		obj.select_set(True, view_layer=view_layer)
	view_layer.objects.active = root
	view_layer.update()
	glb_path = output / "gateward-ark.glb"
	blend_path = output / "gateward-ark.blend"
	operator = bpy.ops.export_scene.gltf
	with bpy.context.temp_override(scene=scene, view_layer=view_layer):
		operator(filepath=str(glb_path), export_format=_operator_enum(operator, "export_format", "GLB"), use_selection=True, use_active_scene=True, export_yup=True, export_apply=False, export_extras=True, export_cameras=False, export_lights=False, export_animations=False)
	# A self-contained scene library is an editable .blend file; no save-as operation
	# changes the user's active filename or pulls their unrelated scene into it.
	bpy.data.libraries.write(str(blend_path), {scene}, fake_user=True, compress=True)
	meshes = [obj for obj in collection.objects if obj.type == "MESH"]
	triangles = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in meshes)
	bounds = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
	return {
		"glb": str(glb_path), "blend": str(blend_path), "scene": scene.name,
		"root": root.name, "mesh_objects": len(meshes), "materials": len(materials),
		"triangles": triangles,
		"bounds_min": [min(point[axis] for point in bounds) for axis in range(3)],
		"bounds_max": [max(point[axis] for point in bounds) for axis in range(3)],
		"anchors": [f"Mount_{index:02d}" for index in range(1, 9)],
		"drives": [f"Drive_{index:02d}" for index in range(1, 5)],
	}


if __name__ == "__main__" and "--gateward-export" in sys.argv:
	import json
	flag = sys.argv.index("--gateward-export")
	if flag + 1 >= len(sys.argv):
		raise SystemExit("--gateward-export requires an output directory")
	result = build_ark(sys.argv[flag + 1])
	# An explicitly factory-startup background process owns its whole document.
	# Normalize its source file so opening it starts on the model, while the
	# callable build_ark() remains safe inside the user's existing live document.
	if bpy.app.background and "--factory-startup" in sys.argv:
		asset_scene = bpy.data.scenes[result["scene"]]
		bpy.context.window.scene = asset_scene
		for other_scene in tuple(bpy.data.scenes):
			if other_scene != asset_scene:
				bpy.data.scenes.remove(other_scene)
		for obj in tuple(bpy.data.objects):
			if not _owned(obj):
				bpy.data.objects.remove(obj, do_unlink=True)
		bpy.ops.wm.save_as_mainfile(filepath=result["blend"], check_existing=False, compress=True)
	print(json.dumps(result, indent=2))
