/** Source layout contract. This catches accidental boundary mistakes; it is not an authorization check. */
const serverBoundaryRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      marker: 'Server modules must import "server-only" to prevent client bundling.',
      client: 'Server modules cannot declare "use client".',
      action: 'Action entry points in src/app/actions must declare "use server".',
      location: 'Keep "use server" entry points in src/app/actions; shared services belong in src/server.',
      chat: 'The chat transport may only POST to /api/chat with same-origin credentials and redirect rejection.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    const server = filename.includes("/src/server/");
    const action = filename.includes("/src/app/actions/");
    return {
      Identifier(node) {
        if (!filename.endsWith('/src/features/conversation-workspace/services/chat-stream.ts') || node.name !== 'fetch') return;
        const call = node.parent;
        const options = call.arguments?.[1];
        const property = name => {
          if (options?.type !== 'ObjectExpression' || options.properties.some(value => value.type !== 'Property')) return undefined;
          const matches = options.properties.filter(value => (value.key.name ?? value.key.value) === name);
          return matches.length === 1 ? matches[0].value?.value : undefined;
        };
        if (call.type !== 'CallExpression' || call.callee !== node || call.arguments[0]?.value !== '/api/chat' || property('method') !== 'POST' || property('credentials') !== 'same-origin' || property('redirect') !== 'error') {
          context.report({ node, messageId: 'chat' });
        }
      },
      Program(node) {
        const directives = node.body.filter(statement => statement.type === "ExpressionStatement" && statement.directive);
        const hasDirective = value => directives.some(statement => statement.directive === value);
        const hasMarker = node.body.some(statement =>
          statement.type === "ImportDeclaration"
          && statement.source.value === "server-only"
          && statement.importKind !== "type"
          && statement.specifiers.length === 0);
        if ((server || action) && !hasMarker) context.report({ node, messageId: "marker" });
        if ((server || action) && hasDirective("use client")) context.report({ node, messageId: "client" });
        if (action && !hasDirective("use server")) context.report({ node, messageId: "action" });
      },
      // Also catches inline function directives, which otherwise create unreviewed entry points.
      ExpressionStatement(node) {
        if (node.directive === "use server" && !action) context.report({ node, messageId: "location" });
      },
    };
  },
};

const directAccessMessage = "Use an Action entry point or a server-only service; browser code must not access business APIs or secrets directly.";

export const serverBoundaryConfig = [
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    plugins: { project: { rules: { "server-boundary": serverBoundaryRule } } },
    rules: { "project/server-boundary": "error" },
  },
  {
    // Applies to shared dependencies too, not just files containing 'use client'.
    // Even Server Components/Actions delegate raw I/O and DTO work to src/server.
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-globals": ["error", ...["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].map(name => ({ name, message: directAccessMessage }))],
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: directAccessMessage },
        { object: "navigator", property: "sendBeacon", message: directAccessMessage },
        ...["window", "globalThis", "self"].flatMap(object =>
          ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].map(property => ({ object, property, message: directAccessMessage }))),
      ],
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["node:*", "pg", "pg/*", "postgres", "mysql2", "mysql2/*", "drizzle-orm", "drizzle-orm/*", "@prisma/*", "@supabase/*", "openai", "openai/*", "@anthropic-ai/*", "axios", "axios/*", "ky", "got", "undici", "node-fetch", "http:*", "https:*"],
          message: directAccessMessage,
        }],
      }],
    },
  },
  {
    files: ["src/features/conversation-workspace/services/chat-stream.ts"],
    rules: {
      "no-restricted-globals": ["error", ...["XMLHttpRequest", "WebSocket", "EventSource"].map(name => ({ name, message: directAccessMessage }))],
    },
  },
];
