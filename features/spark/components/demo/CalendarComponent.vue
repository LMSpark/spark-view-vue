<template>
  <div class="calendar-component">
    <h3>📅 日历组件</h3>
    <p>{{ message }}</p>
    <div class="calendar">
      <div class="calendar-header">
        <button @click="previousMonth">◀</button>
        <span class="month-year">{{ currentMonth }}</span>
        <button @click="nextMonth">▶</button>
      </div>
      <div class="calendar-grid">
        <div v-for="day in weekDays" :key="day" class="week-day">
          {{ day }}
        </div>
        <div 
          v-for="date in calendarDates" 
          :key="date.key"
          class="calendar-date"
          :class="{ 'other-month': !date.current, 'today': date.today }"
        >
          {{ date.date }}
        </div>
      </div>
    </div>
    <div class="calendar-info">
      <p>🗓️ 这是一个模拟的日历组件</p>
      <p>⚡ 只在需要查看日期时才加载</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Props {
  message?: string
}

const props = withDefaults(defineProps<Props>(), {
  message: '日历组件已加载'
})

const currentDate = ref(new Date())

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const currentMonth = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth() + 1
  return `${year}年 ${month}月`
})

const calendarDates = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDay = firstDay.getDay()
  
  const dates = []
  
  // 上个月的日期
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startDay - 1; i >= 0; i--) {
    dates.push({
      date: prevMonthLastDay - i,
      current: false,
      today: false,
      key: `prev-${i}`
    })
  }
  
  // 当前月的日期
  const today = new Date()
  for (let i = 1; i <= lastDay.getDate(); i++) {
    dates.push({
      date: i,
      current: true,
      today: today.getFullYear() === year && 
             today.getMonth() === month && 
             today.getDate() === i,
      key: `current-${i}`
    })
  }
  
  // 下个月的日期
  const remaining = 42 - dates.length
  for (let i = 1; i <= remaining; i++) {
    dates.push({
      date: i,
      current: false,
      today: false,
      key: `next-${i}`
    })
  }
  
  return dates
})

function previousMonth() {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() - 1,
    1
  )
}

function nextMonth() {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() + 1,
    1
  )
}

onMounted(() => {
  console.log('✅ CalendarComponent 已挂载')
})
</script>

<style scoped>
.calendar-component {
  padding: 20px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

h3 {
  margin: 0 0 15px 0;
  font-size: 24px;
}

.calendar {
  background: rgba(255, 255, 255, 0.2);
  padding: 20px;
  border-radius: 8px;
  margin: 20px 0;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.calendar-header button {
  background: rgba(255, 255, 255, 0.3);
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.calendar-header button:hover {
  background: rgba(255, 255, 255, 0.5);
}

.month-year {
  font-size: 18px;
  font-weight: bold;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}

.week-day {
  text-align: center;
  font-weight: bold;
  padding: 10px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.calendar-date {
  text-align: center;
  padding: 10px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.calendar-date:hover {
  background: rgba(255, 255, 255, 0.5);
  transform: scale(1.1);
}

.calendar-date.other-month {
  opacity: 0.3;
}

.calendar-date.today {
  background: white;
  color: #4facfe;
  font-weight: bold;
}

.calendar-info {
  background: rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
}

.calendar-info p {
  margin: 5px 0;
}
</style>
