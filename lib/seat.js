/**
 * Seat coordinates. The engine stays canonical: red's back rank is 0.
 * A black seat rotates the board 180°, so that side's own pieces sit on
 * rank 0 and that side's left is file 0. The rotation is its own inverse.
 */

export function toSeat(square, seat) {
  if (!square) return null;
  if (seat === "black") return { file: 8 - square.file, rank: 9 - square.rank };
  return { file: square.file, rank: square.rank };
}

export function fromSeat(square, seat) {
  return toSeat(square, seat);
}
