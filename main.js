/*
 * @Author: TonyJiangWJ
 * @Last Modified by: TonyJiangWJ
 * @Last Modified time: 2020-09-22 21:22:34
 * @Description: 
 */
require('./modules/init_if_needed.js')(runtime, this)
let { config } = require('./config.js')(runtime, this)
const resolver = require('./lib/AutoJSRemoveDexResolver.js')
let singletonRequire = require('./lib/SingletonRequirer.js')(runtime, this)
let runningQueueDispatcher = singletonRequire('RunningQueueDispatcher')
let { logInfo, errorInfo, warnInfo, debugInfo, infoLog, debugForDev, flushAllLogs } = singletonRequire('LogUtils')
let FloatyInstance = singletonRequire('FloatyUtil')
let commonFunctions = singletonRequire('CommonFunction')
let tryRequestScreenCapture = singletonRequire('TryRequestScreenCapture')
let callStateListener = singletonRequire('CallStateListener')
let resourceMonitor = require('./lib/ResourceMonitor.js')(runtime, this)
let unlocker = require('./lib/Unlock.js')
let mainExecutor = require('./core/MainExecutor.js')
callStateListener.exitIfNotIdle()
// 不管其他脚本是否在运行 清除任务队列 适合只使用蚂蚁森林的用户
if (config.single_script) {
  logInfo('======单脚本运行直接清空任务队列=======')
  runningQueueDispatcher.clearAll()
}
logInfo('======加入任务队列，并关闭重复运行的脚本=======')
runningQueueDispatcher.addRunningTask()
// 注册自动移除运行中任务
commonFunctions.registerOnEngineRemoved(function () {
  // 移除运行中任务
  runningQueueDispatcher.removeRunningTask(true, true,
    () => {
      // 保存是否需要重新锁屏
      unlocker.saveNeedRelock()
      events.removeAllListeners()
      events.recycle()
      debugInfo('校验并移除已加载的dex')
      resolver()
      flushAllLogs()
      config.isRunning = false
      console.clear()
    }
  )
})
/***********************
 * 初始化
 ***********************/
logInfo('======校验无障碍功能======')
// 检查手机是否开启无障碍服务
// 当无障碍经常莫名消失时  可以传递true 强制开启无障碍
// if (!commonFunctions.checkAccessibilityService(true)) {
if (!commonFunctions.checkAccessibilityService()) {
  try {
    auto.waitFor()
  } catch (e) {
    warnInfo('auto.waitFor()不可用')
    auto()
  }
}
logInfo('---前置校验完成;启动系统--->>>>')
// 打印运行环境信息
if (files.exists('version.json')) {
  let content = JSON.parse(files.read('version.json'))
  logInfo(['版本信息：{} nodeId:{}', content.version, content.nodeId])
} else if (files.exists('project.json')) {
  let content = JSON.parse(files.read('project.json'))
  logInfo(['版本信息：{}', content.versionName])
} else {
  logInfo('无法获取脚本版本信息')
}
logInfo(['AutoJS version: {}', app.autojs.versionName])
logInfo(['device info: {} {} {}', device.brand, device.product, device.release])

logInfo(['设备分辨率：[{}, {}]', config.device_width, config.device_height])
logInfo('======解锁并校验截图权限======')
try {
  unlocker.exec()
} catch (e) {
  errorInfo('解锁发生异常, 三分钟后重新开始' + e)
  commonFunctions.printExceptionStack(e)
  commonFunctions.setUpAutoStart(3)
  runningQueueDispatcher.removeRunningTask()
  exit()
}
logInfo('解锁成功')

// 请求截图权限
let screenPermission = false
let actionSuccess = commonFunctions.waitFor(function () {
  if (config.request_capture_permission) {
    screenPermission = tryRequestScreenCapture()
  } else {
    screenPermission = requestScreenCapture(false)
  }
}, 15000)
if (!actionSuccess || !screenPermission) {
  errorInfo('请求截图失败, 设置6秒后重启')
  runningQueueDispatcher.removeRunningTask()
  sleep(6000)
  runningQueueDispatcher.executeTargetScript(FileUtils.getRealMainScriptPath())
  exit()
} else {
  logInfo('请求截屏权限成功')
}
// 初始化悬浮窗
if (!FloatyInstance.init()) {
  runningQueueDispatcher.removeRunningTask()
  // 悬浮窗初始化失败，6秒后重试
  sleep(6000)
  runningQueueDispatcher.executeTargetScript(FileUtils.getRealMainScriptPath())
  exit()
}
// 自动设置刘海偏移量
commonFunctions.autoSetUpBangOffset()
/************************
 * 主程序
 ***********************/
commonFunctions.showDialogAndWait(true)
commonFunctions.listenDelayStart()

// 开发模式不包裹异常捕捉，方便查看错误信息
if (config.develop_mode) {
  mainExecutor.exec()
} else {
  try {
    mainExecutor.exec()
  } catch (e) {
    commonFunctions.setUpAutoStart(1)
    errorInfo('执行异常, 1分钟后重新开始' + e)
    commonFunctions.printExceptionStack(e)
  }
}

if (config.auto_lock === true && unlocker.needRelock() === true) {
  debugInfo('重新锁定屏幕')
  automator.lockScreen()
  unlocker.saveNeedRelock(true)
}
// 关闭悬浮窗
FloatyInstance.close()
flushAllLogs()
runningQueueDispatcher.removeRunningTask(true)
exit()
