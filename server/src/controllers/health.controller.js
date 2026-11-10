export const getHealth = (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'TeamForge API is healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development'
  });
};
