/**
 * Documentation Retriever — RAG for API & Library Documentation
 * ==============================================================
 * Retrieves relevant documentation for npm packages and web APIs
 * during code generation. Uses the semantic search index to find
 * relevant docs and injects them into the AI's context.
 *
 * This prevents the AI from hallucinating API signatures by
 * providing it with current documentation rather than relying
 * solely on training data.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('doc-retriever');

export interface DocSnippet {
  /** Package or API name */
  source: string;

  /** Section title */
  title: string;

  /** Documentation content */
  content: string;

  /** Relevance score (0-1) */
  relevance: number;
}

export interface DocRetrievalResult {
  snippets: DocSnippet[];
  totalTokens: number;
}

/**
 * Known package documentation patterns.
 * Maps common imports to their documentation context.
 */
const PACKAGE_DOCS: Record<string, { description: string; commonAPIs: string[] }> = {
  react: {
    description: 'React UI library',
    commonAPIs: [
      'useState(initialState) - Returns [state, setState]. setState can take a value or updater function.',
      'useEffect(setup, deps?) - Runs setup function after render. Cleanup returned function runs on unmount or before re-run.',
      'useRef(initialValue) - Returns mutable ref object. .current persists across renders.',
      'useMemo(calculateValue, deps) - Memoizes computed value. Recalculates when deps change.',
      'useCallback(fn, deps) - Memoizes callback function. Returns same reference when deps unchanged.',
      'useContext(SomeContext) - Reads and subscribes to a context.',
      'useReducer(reducer, initialArg, init?) - Alternative to useState for complex state logic.',
      'forwardRef(render) - Lets component expose a DOM node to parent with ref.',
      'memo(Component) - Skips re-rendering when props are unchanged.',
      'Suspense - Displays fallback until children finish loading.',
      'lazy(() => import("./Component")) - Lazy-load a component.',
    ],
  },
  'react-dom': {
    description: 'React DOM rendering',
    commonAPIs: [
      'createRoot(container).render(element) - Creates a React root and renders JSX.',
      'createPortal(children, domNode) - Renders children into a different DOM node.',
      'flushSync(callback) - Forces synchronous DOM updates.',
    ],
  },
  'react-router-dom': {
    description: 'React Router for client-side routing',
    commonAPIs: [
      'BrowserRouter - Router using HTML5 history API.',
      'Routes - Container for Route components.',
      'Route path="..." element={<Component />} - Defines a route.',
      'Link to="..." - Navigation link.',
      'useNavigate() - Programmatic navigation. Returns navigate function.',
      'useParams() - Returns URL parameters as an object.',
      'useSearchParams() - Returns [searchParams, setSearchParams].',
      'useLocation() - Returns current location object.',
      'Outlet - Renders child route elements.',
    ],
  },
  next: {
    description: 'Next.js React framework',
    commonAPIs: [
      'App Router: app/ directory with page.tsx, layout.tsx, loading.tsx, error.tsx',
      'Server Components: Default in app/. Use "use client" for client components.',
      'generateMetadata() - Export for dynamic page metadata.',
      'useRouter() from next/navigation - Client-side navigation.',
      'Image from next/image - Optimized image component with width/height required.',
      'Link from next/link - Client-side navigation link.',
      'notFound() from next/navigation - Triggers 404.',
      'redirect(url) from next/navigation - Server-side redirect.',
    ],
  },
  tailwindcss: {
    description: 'Tailwind CSS utility-first framework',
    commonAPIs: [
      'Install: npm install tailwindcss @tailwindcss/postcss. Add to CSS with @import "tailwindcss".',
      'Dark mode: Use dark: prefix. Configure with darkMode: "class" in config.',
      'Responsive: sm: md: lg: xl: 2xl: prefixes.',
      'Hover/Focus: hover: focus: active: group-hover: prefixes.',
      'Custom values: Use bracket notation like w-[200px] text-[#1da1f2].',
    ],
  },
  express: {
    description: 'Express.js web framework',
    commonAPIs: [
      'const app = express() - Create Express app.',
      'app.get/post/put/delete(path, handler) - Route handlers.',
      'app.use(middleware) - Mount middleware.',
      'req.body - Parsed request body (needs express.json() middleware).',
      'req.params - Route parameters.',
      'req.query - Query string parameters.',
      'res.json(data) - Send JSON response.',
      'res.status(code) - Set response status code.',
      'express.static(root) - Serve static files.',
    ],
  },
  prisma: {
    description: 'Prisma ORM for Node.js',
    commonAPIs: [
      'npx prisma init - Initialize Prisma.',
      'npx prisma db push - Push schema to database.',
      'npx prisma generate - Generate client.',
      'prisma.model.findMany({ where, include, orderBy }) - Query multiple records.',
      'prisma.model.findUnique({ where }) - Find one record.',
      'prisma.model.create({ data }) - Create a record.',
      'prisma.model.update({ where, data }) - Update a record.',
      'prisma.model.delete({ where }) - Delete a record.',
    ],
  },
  zod: {
    description: 'Zod schema validation',
    commonAPIs: [
      'z.string() / z.number() / z.boolean() - Primitive schemas.',
      'z.object({ key: z.string() }) - Object schema.',
      'z.array(z.string()) - Array schema.',
      '.optional() / .nullable() - Make field optional/nullable.',
      '.parse(data) - Parse and throw on error.',
      '.safeParse(data) - Parse and return { success, data, error }.',
      'z.infer<typeof schema> - Extract TypeScript type from schema.',
    ],
  },
};

/**
 * Extract package names from file contents (imports/requires).
 */
export function extractPackageNames(content: string): string[] {
  const packages = new Set<string>();

  // ES module imports: import X from 'package'
  const importMatches = content.matchAll(/(?:import|from)\s+['"]([^./][^'"]*)['"]/g);

  for (const match of importMatches) {
    const pkg = match[1].split('/')[0]; // Get root package name

    if (pkg && !pkg.startsWith('.') && !pkg.startsWith('@types')) {
      packages.add(pkg.startsWith('@') ? `${pkg}/${match[1].split('/')[1]}` : pkg);
    }
  }

  // CommonJS requires: require('package')
  const requireMatches = content.matchAll(/require\(['"]([^./][^'"]*)['"]\)/g);

  for (const match of requireMatches) {
    const pkg = match[1].split('/')[0];

    if (pkg && !pkg.startsWith('.')) {
      packages.add(pkg.startsWith('@') ? `${pkg}/${match[1].split('/')[1]}` : pkg);
    }
  }

  return Array.from(packages);
}

/**
 * Retrieve documentation snippets relevant to the packages used in the project.
 */
export function retrieveDocs(packageNames: string[], query: string, maxTokens: number = 2000): DocRetrievalResult {
  const snippets: DocSnippet[] = [];
  let totalTokens = 0;
  const queryLower = query.toLowerCase();

  for (const pkg of packageNames) {
    // Clean package name for lookup
    const cleanPkg = pkg.replace(/^@[^/]+\//, '').split('/')[0];

    // Check if we have docs for this package
    const docs = PACKAGE_DOCS[cleanPkg] || PACKAGE_DOCS[pkg];

    if (!docs) {
      continue;
    }

    // Score relevance based on query overlap
    const relevance = queryLower.includes(cleanPkg) ? 0.9 : 0.5;

    // Filter APIs relevant to the query
    const relevantAPIs = docs.commonAPIs.filter(
      (api) =>
        queryLower.split(/\s+/).some((word) => word.length > 3 && api.toLowerCase().includes(word)) || relevance > 0.7,
    );

    if (relevantAPIs.length > 0) {
      const content = `${docs.description}\n\nKey APIs:\n${relevantAPIs.map((a) => `• ${a}`).join('\n')}`;
      const estimatedTokens = Math.ceil(content.length / 3.3);

      if (totalTokens + estimatedTokens <= maxTokens) {
        snippets.push({
          source: pkg,
          title: `${pkg} Documentation`,
          content,
          relevance,
        });
        totalTokens += estimatedTokens;
      }
    }
  }

  // Sort by relevance
  snippets.sort((a, b) => b.relevance - a.relevance);

  logger.debug(`Retrieved ${snippets.length} doc snippets for ${packageNames.length} packages (${totalTokens} tokens)`);

  return { snippets, totalTokens };
}

/**
 * Format documentation snippets for injection into the AI's system prompt.
 */
export function formatDocsForPrompt(result: DocRetrievalResult): string {
  if (result.snippets.length === 0) {
    return '';
  }

  const sections = result.snippets.map((s) => `### ${s.title}\n${s.content}`).join('\n\n');

  return `
<api_documentation>
The following API documentation is provided to help you write correct code.
Use these as reference — do NOT hallucinate API signatures.

${sections}
</api_documentation>
`;
}
