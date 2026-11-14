const notificationService = require('../services/notificationService');

// 1. Get current customer notifications
exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await notificationService.getUserNotifications(userId);
    const unreadCount = notifications.filter(n => !n.is_read).length;

    return res.json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications,
    });
  } catch (err) {
    console.error('Error in getMyNotifications:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve notifications.' });
  }
};

// 2. Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const ok = await notificationService.markNotificationRead(id, userId);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Notification not found or unauthorized.' });
    }

    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    console.error('Error in markAsRead:', err);
    return res.status(500).json({ success: false, message: 'Failed to update notification.' });
  }
};

// 3. Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await notificationService.markAllNotificationsRead(userId);
    return res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Error in markAllAsRead:', err);
    return res.status(500).json({ success: false, message: 'Failed to update notifications.' });
  }
};

