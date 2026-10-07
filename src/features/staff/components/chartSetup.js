// The only module that imports chart.js (spec 3.4 L235, M6-D20): it registers exactly the pieces the
// two Overview bar charts use, so the lazy chunk carries no unused controller, element or plugin.
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip)

export { Chart }
