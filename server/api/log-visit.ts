import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  // 1. 從 Request Headers 取得 Vercel 傳遞的真實 IP
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for')
  // 如果有多個 IP，通常第一個是真實客戶端 IP
  const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown_ip'
  
  // 2. 取得設備瀏覽器資訊
  const userAgent = getRequestHeader(event, 'user-agent') || 'unknown_device'

  try {
    // 3. 取得伺服器端的 Supabase 客戶端
    const supabase = await serverSupabaseClient(event)
    
    // 4. 將資料寫入資料庫
    const { error } = await supabase
      .from('visitor_logs')
      .insert([
        { ip_address: ip, user_agent: userAgent }
      ])
      
    if (error) {
      console.error('訪客紀錄寫入失敗:', error)
      return { success: false }
    }

    return { success: true }
  } catch (err) {
    console.error('Server API 錯誤:', err)
    return { success: false }
  }
})