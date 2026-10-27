import { html, render } from 'lit-html';
import { experiments } from './catalog';

const list = document.getElementById('experiments');
if (!list) throw new Error('Experiment list is missing.');

render(experiments.map(function (experiment, index) {
	return html`
		<li>
			<a class="experiment" href=${experiment.href}>
				<div class="experiment-art" aria-hidden="true"><span class="orb orb-one"></span><span class="orb orb-two"></span><span class="player"></span><span class="platform"></span><span class="experiment-number">${String(index + 1).padStart(2, '0')}</span></div>
				<div class="experiment-copy">
					<p class="eyebrow">${experiment.category}</p>
					<h2>${experiment.title}<span aria-hidden="true">↗</span></h2>
					<p class="description">${experiment.description}</p>
					<p class="controls">${experiment.controls}</p>
				</div>
			</a>
		</li>`;
}), list);
