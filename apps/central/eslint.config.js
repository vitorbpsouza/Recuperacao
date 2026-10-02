import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lint da central.
 *
 * A regra própria daqui: tela não usa elemento HTML cru de controle. Botão,
 * campo, seleção e tabela vêm de @workspace/ui (shadcn) — é o que garante a
 * mesma identidade, foco visível e acessibilidade em todas as telas.
 */
export default tseslint.config(
  { ignores: ['dist', 'src/routeTree.gen.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Avisa quando o React Compiler pularia um componente. Não usamos o
      // compiler, então o aviso não muda nada aqui.
      'react-hooks/incompatible-library': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name=/^(button|input|select|textarea|table)$/]',
          message: 'Use o componente de @workspace/ui (shadcn) em vez do elemento HTML cru.',
        },
      ],
    },
  },
);
