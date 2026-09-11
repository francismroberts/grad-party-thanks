// ============================================================
// Supabase config — grad party thank-you site
// Safe to commit. These keys are public by design; RLS is what
// protects the data. NEVER put the service_role key in here.
// ============================================================

export const SUPABASE_URL = 'https://izlbkbwchwxstksfygqt.supabase.co'

// Modern publishable key (preferred for new apps)
export const SUPABASE_KEY = 'sb_publishable_eDIa399mGGRkfqmmMxEa3A_LwMamSrI'

// Legacy anon key — fallback only if a library rejects the publishable key
// export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6bGJrYndjaHd4c3Rrc2Z5Z3F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMTM1MzksImV4cCI6MjEwNDY4OTUzOX0.4q82Z0hHvXbRiRB1-MWXzTW_7q5tFB8-zALykv6AXOE'

// Direct storage hostname — required for large resumable uploads.
// Note: .storage.supabase.co, NOT .supabase.co
export const STORAGE_HOST = 'https://izlbkbwchwxstksfygqt.storage.supabase.co'
export const RESUMABLE_ENDPOINT = `${STORAGE_HOST}/storage/v1/upload/resumable`

export const PROJECT_REF = 'izlbkbwchwxstksfygqt'

// Buckets
export const GALLERY_BUCKET = 'gallery'        // public read
export const SUBMISSIONS_BUCKET = 'submissions' // insert-only, 2 GB/file

// Gallery keys — must match the photos.gallery CHECK constraint
export const GALLERIES = ['photobooth', 'photographer']
