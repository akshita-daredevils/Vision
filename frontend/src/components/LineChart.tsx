import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  TimeScale,
  Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { VelocityLog } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, TimeScale, Filler);

interface Props {
  data: VelocityLog[];
}

const LineChart = ({ data }: Props) => {
  const chartData = {
    labels: data.map((d) => d.timestamp),
    datasets: [
      {
        label: 'Velocity (m/s)',
        data: data.map((d) => d.velocity),
        borderColor: '#0EA5E9',
        backgroundColor: 'rgba(14,165,233,0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 2
      }
    ]
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: { intersect: false, mode: 'index' as const }
    },
    scales: {
      x: {
        type: 'time' as const,
        time: { unit: 'minute' as const }
      },
      y: {
        title: { display: true, text: 'm/s' }
      }
    }
  };

  return <Line options={options} data={chartData} />;
};

export default LineChart;
