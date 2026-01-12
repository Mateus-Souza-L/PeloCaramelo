// frontend/src/services/reviews.js
import { authRequest } from "./api";

/**
 * POST /reviews
 * body: { reservationId, rating, comment? }
 */
export async function createReviewRequest(token, { reservationId, rating, comment }) {
  return authRequest("/reviews", token, {
    method: "POST",
    body: {
      reservationId,
      rating,
      comment: comment || "",
    },
  });
}
