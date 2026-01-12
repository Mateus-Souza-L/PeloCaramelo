// backend/src/scripts/migrateLegacyReviews.js
require("dotenv").config();
const pool = require("../config/db");

async function migrateLegacyReviews() {
  const client = await pool.connect();

  try {
    console.log("🚀 Iniciando migração de avaliações legadas...");
    await client.query("BEGIN");

    /**
     * 1) Tutor → Cuidador
     * tutor_rating / tutor_review
     */
    const tutorToCaregiver = await client.query(`
      SELECT
        r.id AS reservation_id,
        r.tutor_id AS reviewer_id,
        r.caregiver_id AS reviewed_id,
        r.tutor_rating AS rating,
        r.tutor_review AS comment,
        COALESCE(r.end_date, r.start_date, NOW()) AS created_at
      FROM reservations r
      WHERE r.tutor_rating IS NOT NULL
        AND r.tutor_rating > 0
        AND r.caregiver_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM reviews rv
          WHERE rv.reservation_id = r.id
            AND rv.reviewer_id = r.tutor_id
        );
    `);

    /**
     * 2) Cuidador → Tutor
     * caregiver_rating / caregiver_review
     */
    const caregiverToTutor = await client.query(`
      SELECT
        r.id AS reservation_id,
        r.caregiver_id AS reviewer_id,
        r.tutor_id AS reviewed_id,
        r.caregiver_rating AS rating,
        r.caregiver_review AS comment,
        COALESCE(r.end_date, r.start_date, NOW()) AS created_at
      FROM reservations r
      WHERE r.caregiver_rating IS NOT NULL
        AND r.caregiver_rating > 0
        AND r.tutor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM reviews rv
          WHERE rv.reservation_id = r.id
            AND rv.reviewer_id = r.caregiver_id
        );
    `);

    let inserted = 0;

    const insertReview = async (row, tutorId, caregiverId) => {
      await client.query(
        `
        INSERT INTO reviews (
          reservation_id,
          tutor_id,
          caregiver_id,
          reviewer_id,
          reviewed_id,
          rating,
          comment,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8);
        `,
        [
          row.reservation_id,
          tutorId,
          caregiverId,
          row.reviewer_id,
          row.reviewed_id,
          row.rating,
          row.comment ?? null,
          row.created_at,
        ]
      );
      inserted++;
    };

    // Tutor → Cuidador
    for (const row of tutorToCaregiver.rows) {
      await insertReview(row, row.reviewer_id, row.reviewed_id);
    }

    // Cuidador → Tutor
    for (const row of caregiverToTutor.rows) {
      await insertReview(row, row.reviewed_id, row.reviewer_id);
    }

    await client.query("COMMIT");

    console.log("✅ Migração concluída com sucesso!");
    console.log(`📝 Reviews inseridas: ${inserted}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erro na migração:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrateLegacyReviews();
