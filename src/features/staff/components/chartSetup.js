// The only module that imports chart.js: it registers exactly the pieces the Overview's ratings
// bar chart uses, so the lazy chunk carries no unused controller, element or plugin. Its legend is
// HTML beside the canvas, so Chart.js's own legend plugin is not part of it.
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

export { Chart }
