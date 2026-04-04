<template>
  <div class="col-md-7">
    <div class="d-flex">
      <input v-model="searchQuery" type="text" class="form-control me-2" placeholder="輸入代號 (如 2330)">
      <button @click="fetchStockData" class="btn btn-primary text-nowrap me-2">本地查詢</button>
      
      <button @click="triggerCloudScrape" class="btn btn-warning text-nowrap me-2" :disabled="isScraping">
        <span v-if="isScraping" class="spinner-border spinner-border-sm me-1"></span>
        {{ isScraping ? '雲端抓取中...' : '⚡ 雲端即時抓取' }}
      </button>
    </div>
  </div>
</template>

<script setup>
const isScraping = ref(false)

const triggerCloudScrape = async () => {
  if (!searchQuery.value) {
    showMessage('請先輸入股票代號', 'warning')
    return
  }

  isScraping.value = true
  showMessage(`正在通知雲端伺服器抓取 ${searchQuery.value}，大約需要 15~30 秒，請稍候...`, 'info')

  try {
    // 呼叫 Hugging Face Space 的 API
    // ⚠️ 替換成你 Hugging Face Space 的 Direct URL (通常是 https://你的帳號-專案名.hf.space)
    const hfApiUrl = 'https://lawxstudents168-bengo-scraper-api.hf.space/api/start-scrape'
    
    // 這是你部署在 Vercel 接收資料的 API (前一個步驟我們寫好的 upload-stock.post.ts)
    const myCallbackUrl = 'https://bengo-nuxt.vercel.app/api/upload-stock'

    await $fetch(hfApiUrl, {
      method: 'POST',
      body: {
        stock_id: searchQuery.value,
        callback_url: myCallbackUrl
      }
    })

    // HF 回傳成功代表已開始背景抓取
    // 我們可以在前端設定一個輪詢 (Polling) 或倒數計時，等待 Vercel 資料庫更新
    let retries = 0
    const checkInterval = setInterval(async () => {
      retries++
      // 試著從資料庫抓取看看資料更新了沒
      await fetchStockData() 
      
      if (retries > 10) { // 最多等 30 秒 (10次 * 3秒)
        clearInterval(checkInterval)
        isScraping.value = false
        showMessage('抓取請求已送出，如果稍後沒有出現資料，請確認雲端伺服器狀態。', 'warning')
      } else if (message.value === '') { // fetchStockData 成功找到資料時會清除 message
        clearInterval(checkInterval)
        isScraping.value = false
        showMessage(`🎉 雲端抓取並同步完成！`, 'success')
      }
    }, 3000) // 每 3 秒檢查一次

  } catch (err) {
    console.error(err)
    showMessage('雲端抓取呼叫失敗', 'danger')
    isScraping.value = false
  }
}
</script>
