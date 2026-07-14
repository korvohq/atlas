# Atlas canonicalization fixtures

These fixtures define Atlas canonicalization version `rfc8785-jcs-v1`.

For each source `*.json` file:

1. Parse the source as JSON.
2. Canonicalize it with RFC 8785 JCS.
3. Compare the result with the matching `*.canonical.json` UTF-8 content after
   removing terminal CR/LF file separators only.
4. SHA-256 the canonical UTF-8 bytes and compare the prefixed value with the
   matching `*.sha256` file.

`artifact-bundle.json` and `artifact-bundle-reordered.json` must produce the same
bytes and hash. `artifact-bundle-nested-change.json` changes only nested claim
content and must produce a different hash. Array order is protocol-significant.

Implementations must reject unsupported canonicalization versions and JSON
values outside the supported I-JSON domain, including non-finite numbers.

