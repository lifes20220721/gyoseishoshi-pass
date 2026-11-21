# xs968799 static placement

This isolated profile places the two already prepared ZIPs on the old server
`sv17319.xserver.jp` (`xs968799`, `85.131.200.80`). The ZIP payloads and their
per-file hashes are unchanged from the prepared November 20 release; only the
server profile in `release.json` has been changed. It requires the repository
Secret `XSERVER_XS968799_FTP_PASSWORD`, exclusively for the old server.

The default workflow action is read-only `inspect`. `place-both` checks both
domain roots before writing, verifies encrypted staging and private backups,
parks originals outside every web root, promotes the files, and checks every
placed SHA-256. On failure it restores original files for both sites by rename.
No FTP delete operation is implemented. Existing unlisted files, `.htaccess`,
`.user.ini`, initial-domain review API, private database and signing material are
preserved. All prior managed files remain in `.pass-placement/<batch>/backup/`.

HTTP verification connects directly to the old IPv4 with the correct Host header
for every file and does not follow redirects. Public DNS is unchanged. Custom
domain HTTPS is pending its separate SSL configuration/cutover stage; no TLS
verification is disabled. No DNS, server configuration deletion or cancellation
operation exists in this profile. The paused xs366651 workflow stays disabled.

Validation: `python -m unittest discover -s hosting/xs968799 -v`.

The live server reserves `/icons/` as an Apache directory alias (its stock
`blank.gif` is returned instead of the domain's uploaded files). The action
`place-icons-compat` reuses the original ZIPs and places the five unchanged icon
images per site at `app-icons/`, changing only icon references in HTML, manifests
and service workers. It preserves the original uploaded icons, backs up replaced
text files, and verifies every active file. `verify-effective` reads that adapted
release. No Apache settings or `.htaccess` changes are needed.
