const db = require('../config/db');

// Get gallery items with optional category filtering
exports.getGalleryItems = async (req, res) => {
  try {
    const { category, type, featured } = req.query;
    let query = `SELECT * FROM gallery_items WHERE 1=1`;
    const params = [];

    if (category && category !== 'all') {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (type && (type === 'image' || type === 'video')) {
      params.push(type);
      query += ` AND media_type = $${params.length}`;
    }

    if (featured === 'true') {
      query += ` AND is_featured = TRUE`;
    }

    query += ` ORDER BY display_order ASC, created_at DESC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    console.error('Error fetching gallery items:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve gallery items' });
  }
};

