import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginJs from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';

export default [
	{ files: ['**/*.{js,mjs,cjs,ts}'] },
	{ languageOptions: { globals: globals.node } },
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	{
		plugins: {
			'@stylistic': stylistic,
		},
	},
	{
		rules: {
			...stylistic.configs['recommended-flat'].rules,
			'@stylistic/arrow-parens': ['warn', 'as-needed'],
			'@stylistic/brace-style': ['off'],
			'@stylistic/indent': ['warn', 'tab'],
			'@stylistic/no-tabs': ['warn', { allowIndentationTabs: true }],
			'@stylistic/semi': ['warn', 'always'],
			'@stylistic/quotes': ['warn', 'single'],
			'@typescript-eslint/no-unused-vars': ['warn'],
		},
	},
];
