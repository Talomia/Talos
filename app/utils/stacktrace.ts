/**
 * Cleans runtime engine URLs from stack traces to show relative paths instead.
 * Handles both WebContainer (webcontainer-api.io) and Docker (localhost) URLs.
 */
export function cleanStackTrace(stackTrace: string): string {
  // Function to clean a single URL
  const cleanUrl = (url: string): string => {
    // WebContainer URLs: https://{port}.local-credentialless.webcontainer-api.io/path
    const wcRegex = /^https?:\/\/[^/]+\.webcontainer-api\.io(\/.*)?$/;

    if (wcRegex.test(url)) {
      const pathRegex = /^https?:\/\/[^/]+\.webcontainer-api\.io\/(.*?)$/;
      const match = url.match(pathRegex);

      return match?.[1] || '';
    }

    // Docker engine URLs: http://localhost:{port}/path
    const dockerRegex = /^https?:\/\/localhost:\d+(\/.*)?$/;

    if (dockerRegex.test(url)) {
      const pathRegex = /^https?:\/\/localhost:\d+\/(.*?)$/;
      const match = url.match(pathRegex);

      return match?.[1] || '';
    }

    return url;
  };

  // Split the stack trace into lines and process each line
  return stackTrace
    .split('\n')
    .map((line) => {
      // Match WebContainer URLs
      line = line.replace(/(https?:\/\/[^/]+\.webcontainer-api\.io\/[^\s)]+)/g, (match) => cleanUrl(match));

      // Match Docker engine localhost URLs
      line = line.replace(/(https?:\/\/localhost:\d+\/[^\s)]+)/g, (match) => cleanUrl(match));

      return line;
    })
    .join('\n');
}
