---
description: How to successfully test in the browser on the 1st try
---

# Browser Testing Protocol

To ensure successful browser testing on the **first attempt**, ALWAYS follow these steps BEFORE spawning a browser subagent:

1. **Verify Development Server Status:** Check if the local development server (e.g., Vite) is currently running in a terminal.
2. **Start the Server if Offline:** If the server is not running, use the `run_command` tool to start it (e.g., `npm run dev`). Make sure to use `WaitMsBeforeAsync` to give it enough time to start up.
3. **Wait for Readiness:** Ensure the server is fully started and bound to its port (usually `http://localhost:5173`) before attempting to connect.
4. **Subagent Execution:** Only *after* confirming the server is online should you dispatch the `browser_subagent` to navigate to the localhost URL. 

Failure to start the server first will result in `ERR_CONNECTION_REFUSED` and a failed test.
