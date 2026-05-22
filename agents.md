# Agents.md
## Be aware of the following
- this is running in a Window workstation
- the current version of PowerShell in this workstation doesn't support the && syntax
- this app will be deployed to Vercel's Hobby plan; one of the core constraints of this plan is that up to 12 serverless functions can be created
- github repo is https://github.com/rdaudt/social-image-studio

## Follow these guidelines
- whenever I inform that a PR has been squashed and merged, automatically run the post-merge cleanup steps without asking for authorization: switch to main, re-sync it, and delete the feature branch locally and remotely
- do not ask me to do something that you can do yourself with the clis or other tools; offer to do it yourself, be proactive

- You have access to `ast-grep` (via the `sg` command) on this machine. To maximize token efficiency and cut costs, you must prioritize structural search over text grep.
CRITICAL INSTRUCTIONS:
1. When searching for API usage, React hooks, function calls, or class definitions, use `sg --lang <language> -p '<pattern>'`.
2. Avoid dumping raw `grep` text walls into the prompt context window. 
3. Only use standard text search for searching comments, strings, or prose.
