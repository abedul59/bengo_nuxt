<template>
  <div class="bg-light min-vh-100 pb-5">
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary mb-4 shadow-sm">
      <div class="container">
        <a class="navbar-brand fw-bold" href="/">🚀 Bengo Analytics Pro</a>
      </div>
    </nav>

    <div class="container">
      <h2 class="text-center mb-4 fw-bold text-dark">籌碼大戶趨勢分析</h2>

      <div v-if="message" :class="`alert alert-${messageType} shadow-sm`" role="alert">
        {{ message }}
      </div>

      <div class="card p-4 mb-4 shadow-sm border-0 rounded-4">
        <div class="row g-4 align-items-center">
          
          <div class="col-lg-7">
            <label class="form-label fw-bold text-secondary">🔍 查詢或雲端抓取</label>
            <div class="input-group shadow-sm">
              <input 
                v-model="searchQuery" 
                @keyup.enter="fetchStockData" 
                type="text" 
                class="form-control" 
                placeholder="輸入代號 (如 2330)"
              >
              <button @click="fetchStockData" class="btn btn-primary px-4">
                本地查詢
              </button>
              <button @click="triggerCloudScrape" class="btn btn-warning px-4 fw-bold" :disabled="isScraping">
                <span v-if="isScraping" class="spinner-border spinner-border-sm me-1"></span>
                {{ isScraping ? '雲端抓取中...' : '⚡ 雲端抓取' }}
              </button>
            </div>
            <div class="mt-2 text-end">
              <button @click="showList = !showList" class="btn btn-sm btn-outline-secondary rounded-pill px-3">
                📂 {{ showList ? '隱藏清單' : '顯示已匯入清單' }}
              </button>
            </div>
          </div>

          <div class="col-lg-5">
            <label class="form-label fw-bold text-secondary">📁 手動匯入本地 JSON</label>
            <div class="input-group shadow-sm">
              <input type="file" @change="handleFileUpload" class="form-control" accept=".json" id="fileInput">
              <button @click="uploadJsonData" class="btn btn-success px-4" :disabled="isUploading">
                <span v-if="isUploading" class="spinner-border spinner-border-sm me-1"></span>
                {{ isUploading ? '處理中...' : '匯入' }}
              </button>
            </div>
          </div>

        </div>
      </div>

      <div v-if="showList" class="card p-4 mb-4 shadow-sm border-0 rounded-4">
        <h5 class="fw-bold mb-3 text-secondary">📂 目前資料庫中的股票清單</h5>
        <div class="table-responsive rounded-3 border">
          <table class="table table-hover align-middle text-center mb-0 bg-white">
            <thead class="table-light">
              <tr>
                <th>股票代碼</th>
                <th>股票名稱</th>
                <th>最新資料日期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="stock in importedStocks" :key="stock.stock_id">
                <td class="fw-bold">{{ stock.stock_id }}</td>
                <td>{{ stock.stock_name }}</td>
                <td class="text-success fw-bold">{{ stock.latest_date }}</td>
                <td>
                  <button @click="quickSearch(stock.stock_id)" class="btn btn-sm btn-primary rounded-pill px-3">查看走勢</button>
                </td>
              </tr>
              <tr v-if="importedStocks.length === 0">
                <td colspan="4" class="text-muted py-4">目前資料庫尚無匯入資料</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="stockRecords.length > 0 && !showList">
        <h3 class="text-center mb-4 fw-bold text-primary">
          {{ searchQuery }} {{ stockNameDisplay }}
        </h3>

        <div class="card p-4 mb-4 shadow-sm border-0 rounded-4">
          <Line v-if="chartData.labels.length" :data="chartData" :options="chartOptions" />
        </div>

        <div class="card p-4 shadow-sm border-0 rounded-4">
          <h5 class="fw-bold mb-3 text-secondary">📊 詳細歷史數據</h5>
          <div class="table-responsive rounded-3 border">
            <table class="table table-striped table-hover text-center align-middle mb-0 bg-white">
              <thead class="table-dark">
                <tr>
                  <th>日期</th>
                  <th>收盤價</th>
                  <th>門檻</th>
                  <th>大戶人數</th>
                  <th>大戶持股(%)</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in stockRecords" :key="row.id">
                  <td>{{ row.date }}</td>
                  <td class="fw-bold text-primary">{{ row.price }}</td>
                  <td>{{ row.bengo_threshold }}</td>
                  <td>{{ row.major_people }}</td>
                  <td class="fw-bold text-danger">{{ row.major_pct }}%</td>
                  <td class="small text-muted">{{ row.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const supabase = useSupabaseClient()

// 狀態變數
const searchQuery = ref('')
const stockNameDisplay = ref('')
const stockRecords = ref([])
const message = ref('')
const messageType = ref('info')

// 載入狀態
const isUploading = ref(false)
const isScraping = ref(false)
let selectedFile = null

// 清單狀態
const importedStocks = ref([])
const showList = ref(false)

// ---------------------------
// 1. 取得清單摘要
// ---------------------------
const fetchSummary = async () => {
  const { data, error } = await supabase
    .from('stock_summary')
    .select('*')
    .order('stock_id', { ascending: true })

  if (!error) {
    importedStocks.value = data || []
  }
}

const quickSearch = async (id) => {
  searchQuery.value = id
  showList.value = false
  await fetchStockData()
}

onMounted(() => {
  fetchSummary()
  // 背景呼叫 API 紀錄訪客，保持 Supabase 活躍
  $fetch('/api/log-visit', { method: 'GET' }).catch(() => {})
})

// ---------------------------
// 2. 本地資料庫查詢
// ---------------------------
const fetchStockData = async () => {
  if (!searchQuery.value) return
  
  const { data, error } = await supabase
    .from('stock_data')
    .select('*')
    .eq('stock_id', searchQuery.value)
    .order('date', { ascending: false })

  if (error) {
    showMessage(`查詢失敗: ${error.message}`, 'danger')
    return
  }

  if (data && data.length > 0) {
    stockRecords.value = data
    stockNameDisplay.value = data[0].stock_name
    showList.value = false
    showMessage('', 'info')
  } else {
    stockRecords.value = []
    showMessage(`資料庫中找不到代號 ${searchQuery.value} 的資料。您可以使用右側匯入或點擊「雲端抓取」。`, 'warning')
  }
}

// ---------------------------
// 3. 觸發 Hugging Face 雲端抓取
// ---------------------------
const triggerCloudScrape = async () => {
  if (!searchQuery.value) {
    showMessage('請先輸入要抓取的股票代號！', 'warning')
    return
  }

  isScraping.value = true
  showMessage(`正在通知雲端伺服器抓取 [${searchQuery.value}]，大約需要 15~30 秒，請稍候...`, 'info')

  try {
    // ⚠️ 這裡請換成您部署在 Hugging Face Space 的網址
    const hfApiUrl = 'https://lawxstudents168-bengo-scraper-api.hf.space/api/start-scrape'
    
    // 自動取得目前網站的網址作為 Callback (無論是在 localhost 還是 Vercel 都適用)
    const myCallbackUrl = `${window.location.origin}/api/upload-stock`

    await $fetch(hfApiUrl, {
      method: 'POST',
      body: {
        stock_id: searchQuery.value,
        callback_url: myCallbackUrl
      }
    })

    // 開始輪詢 (Polling) 檢查資料庫是否更新
    let retries = 0
    const checkInterval = setInterval(async () => {
      retries++
      await fetchStockData() // 嘗試查詢資料
      
      if (stockRecords.value.length > 0) {
        clearInterval(checkInterval)
        isScraping.value = false
        showMessage(`🎉 雲端抓取並同步完成！`, 'success')
        await fetchSummary() // 更新清單
      } else if (retries >= 12) { // 最多等 36 秒 (12次 * 3秒)
        clearInterval(checkInterval)
        isScraping.value = false
        showMessage('抓取請求已送出，但等待超時。如果稍後沒有出現資料，請確認雲端伺服器狀態。', 'warning')
      }
    }, 3000)

  } catch (err) {
    console.error(err)
    showMessage('無法連線到雲端抓取伺服器，請確認網址是否正確。', 'danger')
    isScraping.value = false
  }
}

// ---------------------------
// 4. 手動上傳 JSON
// ---------------------------
const handleFileUpload = (event) => {
  selectedFile = event.target.files[0]
}

const cleanInt = (v) => parseInt(String(v).replace(/,/g, '')) || 0
const cleanFloat = (v) => parseFloat(String(v).replace(/,/g, '').replace('%', '')) || 0.0

const uploadJsonData = async () => {
  if (!selectedFile) {
    showMessage('請先選擇 JSON 檔案', 'warning')
    return
  }

  isUploading.value = true
  const reader = new FileReader()
  
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result)
      const stock_id = String(data.stock_id)
      const stock_name = String(data.stock_name)
      const history = data.history || []

      const batchData = history.map(row => {
        const d_str = String(row.date).split('.')[0]
        const formattedDate = `${d_str.slice(0, 4)}-${d_str.slice(4, 6)}-${d_str.slice(6, 8)}`
        
        return {
          stock_id,
          stock_name,
          date: formattedDate,
          price: cleanFloat(row.price),
          total_shares: cleanInt(row.total_shares),
          total_people: cleanInt(row.total_people || row.total_ppl),
          bengo_threshold: row.threshold_str || row.bengo_threshold || '',
          major_people: cleanInt(row.major_ppl || row.major_people),
          major_pct: cleanFloat(row.major_pct),
          note: row.note || ''
        }
      }).filter(row => row.date && !row.date.includes('undefined'))

      if (batchData.length > 0) {
        const { error } = await supabase
          .from('stock_data')
          .upsert(batchData, { onConflict: 'stock_id,date' })
        
        if (error) throw error

        showMessage(`成功匯入 ${batchData.length} 筆資料！`, 'success')
        searchQuery.value = stock_id
        await fetchStockData()
        await fetchSummary() 
        showList.value = false
      }
    } catch (err) {
      console.error(err)
      showMessage(`解析或匯入失敗: ${err.message}`, 'danger')
    } finally {
      isUploading.value = false
      selectedFile = null
      document.getElementById('fileInput').value = ''
    }
  }
  reader.readAsText(selectedFile)
}

// ---------------------------
// 5. 工具與圖表設定
// ---------------------------
const showMessage = (msg, type) => {
  message.value = msg
  messageType.value = type
  if (msg === '') messageType.value = 'info'
}

const chartData = computed(() => {
  const reversedData = [...stockRecords.value].reverse().slice(-180) 
  return {
    labels: reversedData.map(d => d.date),
    datasets: [
      {
        label: '大戶持股比例 (%)',
        data: reversedData.map(d => d.major_pct),
        borderColor: '#dc3545',
        backgroundColor: 'rgba(220, 53, 69, 0.1)',
        yAxisID: 'y',
        tension: 0.3,
        fill: true
      },
      {
        label: '股價',
        data: reversedData.map(d => d.price),
        borderColor: '#0d6efd',
        backgroundColor: 'rgba(13, 110, 253, 0.1)',
        yAxisID: 'y1',
        borderDash: [5, 5],
        tension: 0.3
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  interaction: { mode: 'index', intersect: false },
  scales: {
    y: { type: 'linear', display: true, position: 'left', title: { display: true, text: '持股 %' } },
    y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '股價' } }
  }
}
</script>

<style scoped>
.rounded-4 { border-radius: 1rem !important; }
.table-responsive { max-height: 500px; overflow-y: auto; }
</style>
