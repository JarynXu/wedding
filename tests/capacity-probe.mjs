// 仅由隔离压测以 --import 挂载；生产镜像不装配诊断接口。
import { readFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();
function cgroup(file) { try { return readFileSync('/sys/fs/cgroup/' + file, 'utf8').trim(); } catch { return null; } }
setInterval(() => {
  const memory = process.memoryUsage();
  console.log(JSON.stringify({ event: 'capacity.sample', time: Date.now(), pid: process.pid, memory, cpu: process.cpuUsage(), eventLoopP99Ms: lag.percentile(99) / 1e6,
    cgroupBytes: Number(cgroup('memory.current')), memoryEvents: cgroup('memory.events'), cpuStat: cgroup('cpu.stat'), constrainedMemoryBytes: (process.constrainedMemory?.() || 0) }));
  lag.reset();
}, 1000).unref();
