const path = require('node:path');

/**
 * Custom ESLint rule to prevent imports from @config/env in sentry.edge.config.ts
 * This rule detects both direct and indirect imports.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent imports from @config/env in sentry.edge.config.ts (directly or indirectly)',
      category: 'Possible Errors',
      recommended: false,
    },
    fixable: null,
    schema: [],
    messages: {
      directImport:
        'Direct import from "@config/env" is not allowed in sentry.edge.config.ts',
      indirectImport:
        'Indirect import from "@config/env" through "{{moduleName}}" is not allowed in sentry.edge.config.ts',
    },
  },

  create(context) {
    const filename = context.getFilename();
    const _sourceCode = context.getSourceCode();

    // Only apply this rule to sentry.edge.config.ts
    if (!filename.endsWith('sentry.edge.config.ts')) {
      return {};
    }

    // Helper function to resolve module path
    function resolveModulePath(importPath, currentFile) {
      if (importPath.startsWith('@config/env')) {
        return '@config/env';
      }

      // Handle relative imports
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const currentDir = path.dirname(currentFile);
        const resolvedPath = path.resolve(currentDir, importPath);
        const relativePath = path.relative(process.cwd(), resolvedPath);

        // Check if this resolves to config/env.ts
        if (relativePath.replace(/\\/g, '/').includes('config/env')) {
          return '@config/env';
        }
      }

      return null;
    }

    // Helper function to check if a module imports from @config/env
    function checkModuleForConfigEnvImport(modulePath, visited = new Set()) {
      if (visited.has(modulePath)) {
        return false; // Avoid circular dependencies
      }
      visited.add(modulePath);

      try {
        let moduleFilePath;

        // Handle relative imports
        if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
          const currentDir = path.dirname(filename);
          moduleFilePath = path.resolve(currentDir, modulePath);

          // Try different extensions
          const extensions = ['.ts', '.js', '.tsx', '.jsx'];
          for (const ext of extensions) {
            const fullPath = moduleFilePath + ext;
            if (require('node:fs').existsSync(fullPath)) {
              moduleFilePath = fullPath;
              break;
            }
          }
        } else {
          // For absolute imports, we'll need to resolve them properly
          // This is a simplified version - in a real implementation, you might want to use
          // the TypeScript compiler API or a module resolution library
          return false;
        }

        if (!require('node:fs').existsSync(moduleFilePath)) {
          return false;
        }

        const moduleContent = require('node:fs').readFileSync(
          moduleFilePath,
          'utf8',
        );

        // Check for direct imports from @config/env
        if (
          moduleContent.includes('@config/env') ||
          moduleContent.includes('config/env')
        ) {
          return true;
        }

        // Parse imports in the module and recursively check them
        const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
        let match = importRegex.exec(moduleContent);
        while (match !== null) {
          const importPath = match[1];
          if (resolveModulePath(importPath, moduleFilePath) === '@config/env') {
            return true;
          }

          // Recursively check nested imports (with depth limit to prevent infinite recursion)
          if (
            visited.size < 10 &&
            checkModuleForConfigEnvImport(importPath, visited)
          ) {
            return true;
          }

          match = importRegex.exec(moduleContent);
        }
      } catch (_error) {
        // If we can't read the file, assume it's safe
        return false;
      }

      return false;
    }

    return {
      ImportDeclaration(node) {
        const importPath = node.source.value;

        // Check for direct import from @config/env
        if (resolveModulePath(importPath, filename) === '@config/env') {
          context.report({
            node,
            messageId: 'directImport',
          });
          return;
        }

        // Check for indirect imports
        if (checkModuleForConfigEnvImport(importPath)) {
          context.report({
            node,
            messageId: 'indirectImport',
            data: {
              moduleName: importPath,
            },
          });
        }
      },

      // Also check require() calls
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal'
        ) {
          const requirePath = node.arguments[0].value;

          // Check for direct require from @config/env
          if (resolveModulePath(requirePath, filename) === '@config/env') {
            context.report({
              node,
              messageId: 'directImport',
            });
            return;
          }

          // Check for indirect requires
          if (checkModuleForConfigEnvImport(requirePath)) {
            context.report({
              node,
              messageId: 'indirectImport',
              data: {
                moduleName: requirePath,
              },
            });
          }
        }
      },
    };
  },
};
