import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['dist/**', 'node_modules/**'] },
	{
		files: ['**/*.ts', '**/*.tsx'],
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-non-null-assertion': 'error',
			'@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
		},
	},
);
