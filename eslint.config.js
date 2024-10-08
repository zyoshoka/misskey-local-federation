import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginJs from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';

export default [
	{ files: ['**/*.{js,mjs,cjs,ts}'] },
	{ ignores: ['node_modules'] },
	{ languageOptions: { globals: globals.node } },
	pluginJs.configs.recommended,
	...tseslint.configs.strict,
	...tseslint.configs.stylistic,
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
			'@typescript-eslint/no-dynamic-delete': ['warn'],
			'@typescript-eslint/no-non-null-assertion': ['warn'],
			'@typescript-eslint/no-unused-vars': ['warn'],
		},
	},
];
