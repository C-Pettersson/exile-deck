# Security

Please report vulnerabilities through GitHub's private reporting (Security tab, "Report a vulnerability"), not in a
public issue. The latest release is supported.

The most sensitive part is the input helper (`bin/helper.ps1`), which sends keystrokes to the active Path of Exile
window and uses the clipboard.
