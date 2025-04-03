# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Run Commands
- Chrome extension development: Load unpacked extension from chrome://extensions
- No formal build process - extension runs directly from source files

## Code Style Guidelines
- Indentation: 2 spaces
- String quotes: Single quotes for strings
- Semicolons: Required at end of statements
- Naming: camelCase for variables/methods, PascalCase for classes
- Private methods: Prefix with underscore (_methodName)
- Modules: Use ES6 import/export syntax with relative paths
- Imports: Include file extensions in import paths

## Architecture
- Chrome extension with Manifest V3
- Web Components (wc/ directory) for UI elements
- Worker framework (worker/ directory) for background processing
- Use WorkerRegistry for service worker management

## Error Handling
- Log errors with console.error
- Validate data before processing
- Return error messages to client when appropriate