/**
 * One shared xiangqi session. The sidebar and the MCP handlers both read
 * and write this value; neither keeps a private board.
 */

import { cloneBoard, gameStatus, openingBoard } from "./xiangqi.js";

export function createSession(options = {}) {
  const playerSide = options.playerSide === "black" ? "black" : "red";
  const board = options.board ? cloneBoard(options.board) : openingBoard();
  const turn = options.turn === "black" ? "black" : "red";
  const status = gameStatus(board, turn);
  return {
    board,
    turn,
    playerSide,
    aiSide: playerSide === "red" ? "black" : "red",
    selected: null,
    inCheck: status.inCheck,
    winner: status.over ? status.winner : null,
    winReason: status.over ? status.winReason : null,
    reasoning: null,
    lastMove: null,
    lastAgentRequest: null,
    sidebarNonce: 0,
    awaitingChoice: options.awaitingChoice === true,
    notice: null,
    noticeMark: null,
  };
}

export function pieceList(board) {
  const pieces = [];
  for (let rank = 0; rank < board.length; rank++) {
    for (let file = 0; file < board[rank].length; file++) {
      const cell = board[rank][file];
      if (!cell) continue;
      pieces.push({ side: cell.side, type: cell.type, label: cell.label, file, rank });
    }
  }
  return pieces;
}
