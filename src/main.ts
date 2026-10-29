import { html, render } from 'lit-html';
import { experiments } from './catalog';

const list = document.getElementById('experiments');
if (!list) throw new Error('Experiment list is missing.');

render(experiments.map(function (experiment) {
	return html`
		<li class="game-card">
			${experiment.thumbnail ? html`<img class="game-art" src=${experiment.thumbnail} alt=${experiment.thumbnailAlt ?? ''} width="1100" height="619" />` : ''}
			<div class="game-meta"><p class="status">Prototype</p><p class="genre">${experiment.category}</p></div>
			<h3>${experiment.title}</h3>
			<p class="game-description">${experiment.description}</p>
			<p class="controls">${experiment.controls}</p>
			<a class="action action-primary" href=${experiment.href} aria-label=${`Play now — ${experiment.title}`}><span aria-hidden="true">▷</span> Play now</a>
		</li>`;
}), list);
