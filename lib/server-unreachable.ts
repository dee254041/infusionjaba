import { NextResponse } from 'next/server'

/** Default nginx 502 document. Returned as-is when the public site is switched off. */
export const NGINX_502_HTML = `<html>
<head><title>502 Bad Gateway</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
<hr><center>nginx</center>
</body>
</html>
`

export function unreachableResponse(): NextResponse {
  return new NextResponse(NGINX_502_HTML, {
    status: 502,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      pragma: 'no-cache',
      expires: '0',
      'x-content-type-options': 'nosniff',
    },
  })
}
