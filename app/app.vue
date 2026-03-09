<template>
  <div class="bg-light min-vh-100">
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary mb-4">
      <div class="container">
        <a class="navbar-brand fw-bold" href="/">Bengo Analytics (Nuxt)</a>
      </div>
    </nav>

    <div class="container py-4">
      <h2 class="text-center mb-4 fw-bold text-primary">Bengo 籌碼大戶趨勢</h2>

      <div v-if="message" :class="`alert alert-${messageType}`">{{ message }}</div>

      <div class="card p-4 mb-4 shadow-sm">
        <div class="row g-3">
          <div class="col-md-7">
            <div class="d-flex">
              <input 
                v-model="searchQuery" 
                @keyup.enter="fetchStockData" 
                type="text" 
                class="form-control me-2" 
                placeholder="輸入代號 (如 2330)"
              >
              <button @click="fetchStockData" class="btn btn-primary text-nowrap me-2">查詢</button>
              <button @click="showList = !showList" class="btn btn-outline-secondary text-nowrap">
                {{ showList ? '隱藏清單' : '已匯入清單' }}
              </button>
            </div>
          </div>
          <div class="col-md-5">
            <div class="d-flex">
              <input type="file" @change="handleFileUpload" class="form-control me-2" accept=".json">
              <button @click="uploadJsonData" class="btn btn-success text-nowrap" :disabled="isUploading">
                {{ isUploading ? '匯入中...' : '匯入 JSON' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showList" class="card p-3 mb-4 shadow-sm border-secondary">
        <h5 class="fw-bold mb-3">📂 目前已匯入的股票資料</h5>
        <div class="table-responsive">
          <table class="table table-hover align-middle text-center">
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
                <td class="text-success">{{ stock.latest_date }}</td>
                <td>
                  <button @click="quickSearch(stock.stock_id)" class="btn btn-sm btn-primary">查看走勢</button>
                </td>
              </tr>
              <tr v-if="importedStocks.length === 0">
                <td colspan="4" class="text-muted">目前尚無匯入資料</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="stockRecords.length > 0 && !showList">
        <h3 class="text-center mb-3 fw-bold text-secondary">
          {{ searchQuery }} {{ stockNameDisplay }}
        </h3>

        <div class="card p-3 mb-4 shadow-sm">
          <Line v-if="chartData.labels.length" :data="chartData" :options="chartOptions" />
        </div>

        <div class="table-responsive card p-3 shadow-sm">
          <table class="table table-striped table-hover text-center align-middle">
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'

// 註冊 Chart.js 核心元件
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

// 初始化 Supabase 客戶端
const supabase = useSupabaseClient()

// 狀態管理
const searchQuery = ref('')
const stockNameDisplay = ref('')
const stockRecords = ref([])
const message = ref('')
const messageType = ref('info')
const isUploading = ref(false)
let selectedFile = null

// 清單狀態管理
const importedStocks = ref([])
const showList = ref(false)

// ---------------------------
// 1. 讀取「已匯入股票清單」
// ---------------------------
const fetchSummary = async () => {
  const { data, error } = await supabase
    .from('stock_summary')
    .select('*')
    .order('stock_id', { ascending: true })

  if (error) {
    console.error('取得清單失敗:', error)
  } else {
    importedStocks.value = data || []
  }
}

// 點擊清單中的「查看走勢」按鈕
const quickSearch = async (id) => {
  searchQuery.value = id
  showList.value = false // 關閉清單以顯示圖表
  await fetchStockData()
}

// 頁面初次載入時抓取清單
// 原本的 onMounted 區塊
onMounted(() => {
  fetchSummary()

  // [新增] 在背景呼叫 Server API 來記錄訪客，保持 Supabase 活躍
  $fetch('/api/log-visit', { method: 'GET' })
    .then(() => console.log('Visitor logged'))
    .catch(err => console.error('Failed to log visitor', err))
})

// ---------------------------
// 2. 檔案處理與匯入邏輯
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

      // 資料清洗轉換
      const batchData = history.map(row => {
        const d_str = String(row.date).split('.')[0]
        // 將 20260219 轉為 2026-02-19 以符合 PostgreSQL DATE 格式
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
      }).filter(row => row.date && !row.date.includes('undefined'))

      if (batchData.length > 0) {
        // Upsert 寫入資料庫，如果 stock_id + date 存在則更新，否則新增
        const { error } = await supabase
          .from('stock_data')
          .upsert(batchData, { onConflict: 'stock_id,date' })
        
        if (error) throw error

        showMessage(`成功匯入 ${batchData.length} 筆資料！`, 'success')
        
        // 匯入成功後自動切換至該股票並更新清單
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
      // 清空檔案選擇器
      selectedFile = null
      document.querySelector('input[type="file"]').value = ''
    }
  }
  reader.readAsText(selectedFile)
}

// ---------------------------
// 3. 查詢個股詳細資料
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
    showList.value = false // 如果正在看清單，切換回圖表模式
    showMessage('', 'info') // 清除訊息
  } else {
    stockRecords.value = []
    showMessage(`找不到代號 ${searchQuery.value} 的資料`, 'warning')
  }
}

// ---------------------------
// 4. 工具函數與圖表設定
// ---------------------------
const showMessage = (msg, type) => {
  message.value = msg
  messageType.value = type
}

const chartData = computed(() => {
  // 將資料反轉成時間正序（從舊到新）給圖表使用，並取最近 180 筆
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
        tension: 0.3
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
    y: { 
      type: 'linear', 
      display: true, 
      position: 'left', 
      title: { display: true, text: '持股 %' } 
    },
    y1: { 
      type: 'linear', 
      display: true, 
      position: 'right', 
      grid: { drawOnChartArea: false }, 
      title: { display: true, text: '股價' } 
    }
  }
}
</script>

<style scoped>
.card { border-radius: 15px; }
.table-responsive { max-height: 600px; overflow-y: auto; }
</style>