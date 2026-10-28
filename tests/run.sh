#!/bin/sh
# Runs the core logic tests with macOS's built-in JavaScriptCore shell (no Node needed).
cd "$(dirname "$0")/.." || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
if command -v node >/dev/null 2>&1; then
  node -e 'require("./core.js")' 2>/dev/null
  node -e 'global.self=global;require("./core.js");global.SLCore=self.SLCore;require("./tests/core.test.js")'
else
  "$JSC" core.js tests/core.test.js
fi
