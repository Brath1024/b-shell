/**
 * Background watermark for a terminal pane.
 *
 * The xterm canvas inside `.term-wrap` paints a transparent background (see
 * `.xterm { background transparent }` in terminal.styl), so anything drawn
 * behind it shows through the glyphs. This canvas is that "anything": falling
 * matrix columns plus a large, very low-alpha "Brath Shell" label.
 *
 * It is deliberately cheap: the frame rate is capped well below 60fps, it only
 * animates while the tab is active and the document is visible, and it stops
 * entirely when the pane is hidden.
 */

import { Component } from 'react'

const FPS = 8
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789BRATH<>/\\'
const COL_WIDTH = 14
const FONT_SIZE = 12

export default class MatrixWatermark extends Component {
  state = {
    width: 0,
    height: 0
  }

  canvasRef = (el) => {
    this.canvas = el
  }

  componentDidMount () {
    this.resizeObserver = new ResizeObserver(this.handleResize)
    if (this.canvas && this.canvas.parentElement) {
      this.resizeObserver.observe(this.canvas.parentElement)
    }
    this.handleResize()
    this.start()
  }

  componentDidUpdate (prevProps) {
    if (prevProps.active !== this.props.active) {
      this.props.active ? this.start() : this.stop()
    }
  }

  componentWillUnmount () {
    this.stop()
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  onVisibility = () => {
    if (document.hidden) {
      this.stop()
    } else if (this.props.active) {
      this.start()
    }
  }

  handleResize = () => {
    if (!this.canvas || !this.canvas.parentElement) {
      return
    }
    const { clientWidth, clientHeight } = this.canvas.parentElement
    if (!clientWidth || !clientHeight) {
      return
    }
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(clientWidth * dpr)
    this.canvas.height = Math.round(clientHeight * dpr)
    this.canvas.style.width = clientWidth + 'px'
    this.canvas.style.height = clientHeight + 'px'
    this.ctx = this.canvas.getContext('2d')
    if (!this.ctx) {
      return
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const columns = Math.ceil(clientWidth / COL_WIDTH)
    this.drops = new Array(columns).fill(0).map(() => Math.random() * clientHeight)
    this.size = { width: clientWidth, height: clientHeight }
    this.draw()
  }

  start () {
    if (this.timer) {
      return
    }
    document.removeEventListener('visibilitychange', this.onVisibility)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.timer = setInterval(() => this.draw(true), 1000 / FPS)
  }

  stop () {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  draw (advance) {
    const ctx = this.ctx
    if (!ctx) {
      return
    }
    const { width, height } = this.size
    if (!width || !height) {
      return
    }
    ctx.clearRect(0, 0, width, height)

    // The big label first: it is the part users are meant to notice.
    ctx.save()
    ctx.font = '600 ' + Math.max(28, Math.round(width / 9)) + 'px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(34, 211, 238, 0.075)'
    ctx.fillText('Brath Shell', width / 2, height / 2)
    ctx.restore()

    ctx.save()
    ctx.font = FONT_SIZE + 'px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const step = FONT_SIZE + 4
    for (let i = 0; i < this.drops.length; i++) {
      const y = this.drops[i]
      const x = i * COL_WIDTH + 2
      const char = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length))
      // Bright head fading into a dim trail: no per-cell history is kept, the
      // rows above are simply less opaque bands.
      ctx.fillStyle = 'rgba(52, 211, 153, 0.16)'
      ctx.fillText(char, x, y)
      for (let k = 1; k <= 6; k++) {
        if (y - k * step < 0) {
          break
        }
        ctx.fillStyle = 'rgba(52, 211, 153, ' + (0.10 - k * 0.014) + ')'
        ctx.fillText(GLYPHS.charAt((i + k) % GLYPHS.length), x, y - k * step)
      }
      if (advance) {
        this.drops[i] = y > height + step * 8 ? -Math.random() * 200 : y + step
      }
    }
    ctx.restore()
  }

  render () {
    return <canvas className='term-matrix' ref={this.canvasRef} />
  }
}
