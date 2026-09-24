export default (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  });
};
