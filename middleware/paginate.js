/**
 * Helper de paginación reutilizable
 * Extrae page/limit de query params y devuelve offset + metadata
 */
function parsePagination(query, defaultLimit = 50) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginatedResponse(rows, total, page, limit) {
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

module.exports = { parsePagination, paginatedResponse };
