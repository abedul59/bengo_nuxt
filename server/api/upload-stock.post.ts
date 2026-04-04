import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  try {
    // 1. 讀取傳來的 JSON Body
    const body = await readBody(event)
    const stock_id = String(body.stock_id)
    const stock_name = String(body.stock_name)
    const history = body.history || []

    const cleanInt = (v: any) => parseInt(String(v).replace(/,/g, '')) || 0
    const cleanFloat = (v: any) => parseFloat(String(v).replace(/,/g, '').replace('%', '')) || 0.0

    // 2. 聰明清洗邏輯 (相容舊版 GUI 數據與新版 HF 雲端數據)
    const batchData = history.map((row: any) => {
      let d_str = String(row.date).split('.')[0].trim()
      let formattedDate = d_str
      
      // 如果日期沒有橫線 (例如 20260402)，才幫它切開；如果是 2026-04-02 就直接用
      if (!d_str.includes('-') && d_str.length >= 8) {
        formattedDate = `${d_str.slice(0, 4)}-${d_str.slice(4, 6)}-${d_str.slice(6, 8)}`
      }

      return {
        stock_id,
        stock_name,
        date: formattedDate,
        price: cleanFloat(row.price),
        total_shares: cleanInt(row.total_shares),
        // 雙重相容欄位名稱
        total_people: cleanInt(row.total_people || row.total_ppl),
        bengo_threshold: row.bengo_threshold || row.threshold_str || '',
        major_people: cleanInt(row.major_people || row.major_ppl),
        major_pct: cleanFloat(row.major_pct),
        note: row.note || ''
      }
    }).filter((row: any) => row.date && row.date !== 'undefined' && row.date !== 'null')

    if (batchData.length === 0) {
      return { success: false, message: '沒有有效的資料可匯入' }
    }

    // 3. 初始化 Supabase 連線
    const supabaseUrl = process.env.SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_KEY || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 4. 寫入資料庫
    const { error } = await supabase
      .from('stock_data')
      .upsert(batchData, { onConflict: 'stock_id,date' })
    
    if (error) {
      console.error('Supabase 寫入錯誤:', error)
      throw error
    }

    return { success: true, message: `成功同步 ${batchData.length} 筆資料！` }
    
  } catch (err: any) {
    console.error('API 同步失敗:', err)
    return { success: false, message: err.message }
  }
})
