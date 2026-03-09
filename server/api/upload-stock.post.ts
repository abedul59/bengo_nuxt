import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  try {
    // 1. 讀取 Python 傳來的 JSON Body
    const body = await readBody(event)
    const stock_id = String(body.stock_id)
    const stock_name = String(body.stock_name)
    const history = body.history || []

    // 2. 資料清洗邏輯 (與前端相同)
    const cleanInt = (v: any) => parseInt(String(v).replace(/,/g, '')) || 0
    const cleanFloat = (v: any) => parseFloat(String(v).replace(/,/g, '').replace('%', '')) || 0.0

    const batchData = history.map((row: any) => {
      const d_str = String(row.date).split('.')[0]
      const formattedDate = `${d_str.slice(0, 4)}-${d_str.slice(4, 6)}-${d_str.slice(6, 8)}`
      
      return {
        stock_id,
        stock_name,
        date: formattedDate,
        price: cleanFloat(row.price),
        total_shares: cleanInt(row.total_shares),
        total_people: cleanInt(row.total_people),
        bengo_threshold: row.threshold_str || '',
        major_people: cleanInt(row.major_ppl),
        major_pct: cleanFloat(row.major_pct),
        note: row.note || ''
      }
    }).filter((row: any) => row.date && !row.date.includes('undefined'))

    if (batchData.length === 0) {
      return { success: false, message: '沒有有效的資料可匯入' }
    }

    // 3. 繞過使用者的 Cookie 驗證，直接使用環境變數的 Key 初始化 Supabase 連線
    const supabaseUrl = process.env.SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_KEY || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 4. 寫入資料庫 (使用 Upsert 避免重複)
    const { error } = await supabase
      .from('stock_data')
      .upsert(batchData, { onConflict: 'stock_id,date' })
    
    if (error) throw error

    return { success: true, message: `成功同步 ${batchData.length} 筆資料！` }
    
  } catch (err: any) {
    console.error('API 同步失敗:', err)
    return { success: false, message: err.message }
  }
})