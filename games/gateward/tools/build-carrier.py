"""Build concept C: four-pod fighter carrier. Run with factory-startup Blender.

blender --background --factory-startup --python build-carrier.py -- OUTPUT_DIR
Uses the ark's mesh/material helpers; +X forward, Blender Z up, glTF Y up.
No gameplay registration or fleet rescaling is performed by this asset builder.
"""
import importlib.util
import json
import sys

sys.dont_write_bytecode = True
from pathlib import Path

import bpy
from mathutils import Vector

spec = importlib.util.spec_from_file_location('carrier_mesh_helpers', Path(__file__).with_name('build-ark.py'))
ark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ark)
ark.OWNER_VALUE = 'rack-carrier-v1'


def build_carrier(output_dir):
	output = Path(output_dir).resolve()
	output.mkdir(parents=True, exist_ok=True)
	ark._remove_previous_build()
	scene = ark._tag(bpy.data.scenes.new('Gateward_Carrier'))
	collection = ark._tag(bpy.data.collections.new('Carrier_Asset'))
	scene.collection.children.link(collection)
	root = ark._tag(bpy.data.objects.new('Gateward_Carrier', None))
	collection.objects.link(root)
	root['role'] = 'Fighter delivery; no main battery'
	root['scale_basis'] = 'Fighters x0.5; other ships x1.5; player master unchanged'
	materials = ark._materials()
	materials['plate'] = ark._material('Carrier_HostilePlate', (0.24, 0.155, 0.16))
	materials['mark'] = ark._material('Carrier_RedMark', (0.36, 0.07, 0.045))
	batches = {name: ark.MeshBatch() for name in materials}

	def box(surface, center, size):
		batches[surface].box(center, size)

	def armor(surface, x, y, z, length, width, height, bevel=3):
		bottom = ark._footprint(x-length/2, x+length/2, y-width/2, y+width/2, bevel)
		top = [(x+(px-x)*0.95, y+(py-y)*0.87) for px, py in bottom]
		batches[surface].frustum(bottom, top, z-height/2, z+height/2)

	armor('core', 0, 0, 0, 160, 25, 15)
	for x in (-61, -39, -17, 5, 27, 49, 68):
		armor('plate', x, 0, 8, 19, 24, 4)
	armor('armor', -49, 0, 14, 30, 21, 9)
	armor('window', -46, 0, 19, 23, 18, 2)
	armor('plate', -49, 0, 21, 29, 21, 3)
	box('edge', (-58, 3, 27), (1, 1, 12))
	for side in (-1, 1):
		armor('armor', -74, side*7, 0, 16, 10, 12)
		box('recess', (-82, side*7, 0), (1, 8, 9))
		box('drive', (-82.6, side*7, 0), (0.4, 5, 6))

	for index, (x, y) in enumerate(((-40, -53), (-40, 53), (35, -28), (35, 28)), 1):
		# Rear bays sit outboard so their +X corridors clear the forward pods.
		for offset in (-17, 10):
			armor('armor', x+offset, y/2, 9, 8, abs(y), 6, 1)
			box('edge', (x+offset, y/2, 12.3), (3, abs(y), 1))
		# Hollow bay built from floor, roof, side walls and rear bulkhead.
		armor('armor', x, y, -12, 64, 24, 4)
		armor('plate', x, y, 4, 64, 24, 4)
		for side in (-1, 1):
			armor('plate', x, y+side*11, -4, 64, 3, 14, 1)
			for rib in (-22, -7, 8, 23):
				box('edge', (x+rib, y+side*12.2, -4), (1.2, 0.7, 13))
			box('window', (x+31.6, y+side*8.7, -4), (0.4, 0.6, 11))
			box('edge', (x+31, y+side*10, -4), (3, 2, 16))
		box('core', (x-30, y, -4), (4, 20, 14))
		box('recess', (x-27.8, y, -4), (0.3, 18, 12))
		box('recess', (x, y, -9.8), (57, 18, 0.3))
		for rail in (-6, 6):
			box('window', (x+2, y+rail, -9.5), (55, 0.35, 0.25))
		for rib in (-21, -5, 11):
			armor('armor', x+rib, y, 6.6, 12, 21, 2, 1)
		box('mark', (x+22, y, 6.2), (4, 16, 0.5))
		box('drive', (x-32.3, y, -4), (0.4, 9, 5))
		anchor = ark._tag(bpy.data.objects.new(f'Launch_{index:02}', None))
		collection.objects.link(anchor)
		anchor.parent = root
		anchor.location = (x+34, y, -4)
		anchor['direction'] = '+X'
		anchor['clear_aperture'] = '18 wide x 12 high; sized for half-scale fighters'

	for surface, batch in batches.items():
		if batch.vertices:
			batch.object(f'Carrier_{surface}', collection, materials[surface], root)
	view_layer = scene.view_layers[0]
	for obj in collection.objects:
		obj.select_set(True, view_layer=view_layer)
	view_layer.objects.active = root
	view_layer.update()
	with bpy.context.temp_override(scene=scene, view_layer=view_layer):
		bpy.ops.export_scene.gltf(filepath=str(output/'gateward-carrier.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True, export_extras=True, export_cameras=False, export_lights=False, export_animations=False)
	preview = ark._tag(bpy.data.collections.new('Carrier_Preview'))
	scene.collection.children.link(preview)
	ark._presentation(scene, preview)
	scene.camera.location = (210, -245, 205)
	scene.camera.rotation_euler = (-scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
	scene.camera.data.ortho_scale = 235
	for obj in preview.objects:
		if obj.type == 'LIGHT':
			obj.data.energy *= 0.6
	bpy.data.libraries.write(str(output/'gateward-carrier.blend'), {scene}, fake_user=True, compress=True)
	if bpy.app.background:
		bpy.context.window.scene = scene
		scene.render.engine = 'CYCLES'
		scene.cycles.samples = 24
		scene.render.filepath = str(output/'carrier-oblique.png')
		bpy.ops.render.render(write_still=True)
		for name, position in [('top', (0, 0, 300)), ('front', (300, -10, 35)), ('rear', (-240, -190, 140))]:
			scene.camera.location = position
			scene.camera.rotation_euler = (-scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
			scene.render.filepath = str(output/f'carrier-{name}.png')
			bpy.ops.render.render(write_still=True)
	return {'glb': str(output/'gateward-carrier.glb'), 'triangles': sum(sum(len(f)-2 for f in b.faces) for b in batches.values())}


if __name__ == '__main__':
	print(json.dumps(build_carrier(sys.argv[sys.argv.index('--')+1])))
