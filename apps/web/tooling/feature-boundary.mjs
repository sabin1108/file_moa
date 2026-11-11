import { dirname, relative, resolve } from 'node:path';

const slash = value => value.replaceAll('\\', '/');
const inPrototype = path => path.startsWith('prototypes/') || path.startsWith('features/prototype/');

/** 폴더 이름을 문서 규칙에 그치지 않고 import 경계로 검사한다. 보안 권한 검사는 아니다. */
const featureBoundaryRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      direction: '{{from}} cannot depend on {{to}}. Common UI belongs in src/components; examples and tests stay outside production dependencies.'
    },
  },
  create(context) {
    const sourceRoot = resolve(context.cwd, 'src');
    const from = slash(relative(sourceRoot, context.filename));

    function check(node) {
      if (!node || typeof node.value !== 'string' || !node.value.startsWith('.')) return;

      const to = slash(relative(sourceRoot, resolve(dirname(context.filename), node.value)));
      const shared = from.startsWith('components/') || from.startsWith('styles/') || from.startsWith('shared/');
      const feature = from.startsWith('features/') && !inPrototype(from);
      const server = from.startsWith('server/');
      const liveRoute = from.startsWith('app/') && !from.startsWith('app/preview/');
      const testDependency = to.split('/').includes('tests') || /\.(test|spec)(?:\.[^.]+)?$/.test(to);
      const forbidden = testDependency || ((feature || server || liveRoute || shared) && inPrototype(to))
        || (shared && (to.startsWith('features/') || to.startsWith('app/')))
        || (feature && to.startsWith('app/'))
        || (server && to.startsWith('features/'));

      if (forbidden) context.report({ node, messageId: 'direction', data: { from, to } });
    }

    return {
      ImportDeclaration: node => check(node.source),
      ExportNamedDeclaration: node => check(node.source),
      ExportAllDeclaration: node => check(node.source),
      ImportExpression: node => check(node.source),
      TSImportType: node => check(node.source),
    };
  },
};

export const featureBoundaryConfig = {
  files: ['src/**/*.{ts,tsx,js,jsx,mjs}'],
  plugins: { structure: { rules: { 'feature-boundary': featureBoundaryRule } } },
  rules: { 'structure/feature-boundary': 'error' },
};
