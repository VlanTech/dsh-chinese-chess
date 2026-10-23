#!/usr/bin/env node
/**
 * stdio MCP server for 大肥鱼象棋. dsh-mcp-client spawns this process and
 * publishes its tools as mcp__dafeiyu__read_position and mcp__dafeiyu__submit_move.
 */
import { runStdio } from "./mcp.js";

runStdio();
