'use strict'

var audiograph = audiograph || {}

audiograph.initialized = false

audiograph.debug = true
audiograph.sonification = null

//var baseLibUrl = './'
var baseLibUrl = 'https://lab.adapar.net/cita/audiographs/google/'

audiograph.setup = function() {
	return import(baseLibUrl + 'instrument.js')
	.then(faust => {
		var isWebKitAudio = (typeof (webkitAudioContext) !== "undefined")
		var audio_context = (isWebKitAudio) ? new webkitAudioContext() : new AudioContext()
		var instrument = null

		var sonificationCallback = (audiograph.sonification) ? 
			function () {
				if (audiograph.debug) {
					console.log("Calling sonification callback")
				}
				audiograph.sonification(player.start)
			} 
			: player.start

		var sonification = {
			callback: sonificationCallback,
			scale: {
				isAbsolute: false,
				absolute: {
					min: 0,
					max: 100,
				},
				frequency: {
					min: 100,
					max: 800,
				},
				min: function () {
					if (sonification.scale.isAbsolute) {
						return sonification.scale.absolute.min
					} else {
						return data.minValue()
					}
				},
				max: function () {
					if (sonification.scale.isAbsolute) {
						return sonification.scale.absolute.max
					} else {
						return data.maxValue()
					}
				},
				valueToFrequency: function (value) {
					if (typeof (value) === "undefined") {
						return 0
					}
					var scaleRange = sonification.scale.max() - sonification.scale.min()
					var scaledValue = (value - sonification.scale.min()) / scaleRange
					var freqRange = sonification.scale.frequency.max - sonification.scale.frequency.min
					var freq = Math.ceil((scaledValue * freqRange) + sonification.scale.frequency.min)
					if (freq > sonification.scale.frequency.max) freq = sonification.scale.frequency.max
					if (freq < sonification.scale.frequency.min) freq = sonification.scale.frequency.min
					return freq;
				},
			},
		}

		var player = {
			timeout: null,
			isDiscrete: false,
			durations: { //all in milliseconds
				value: function () {
					if (data.hasValues()) {
						var steps = data.maxLength()
						return Math.ceil(player.durations.total / steps)
					}
					return 0
				},
				valueForInstrument: function () {
					var value = player.durations.value()
					if (player.isDiscrete) {
						value = Math.ceil(value * 0.8)
					}
					return value
				},
				total: 3000,
				min: 3000,
				max: 10000,
			},
			velocity: 127, // 0:127
			setDiscreteMode: function () {
				player.isDiscrete = true
				instrument.setParamValue('/instrument/is_discrete', 1)
				if (audiograph.debug) {
					console.log("isDiscrete is " + (player.isDiscrete ? "true":"false"))
				}
			},
			setContinuousMode: function () {
				player.isDiscrete = false
				instrument.setParamValue('/instrument/is_discrete', 0)
				if (audiograph.debug) {
					console.log("isDiscrete is " + (player.isDiscrete ? "true":"false"))
				}
			},	
			playValues: function (frequency1, frequency2) {
				instrument.setParamValue('/instrument/freq1', frequency1)
				instrument.setParamValue('/instrument/freq2', frequency2)
			},	
			stop: function () {
				if (audiograph.debug) {
					console.log("Player stopping")
				}
				if (player.timeout) {
					clearTimeout(player.timeout)
				}
				player.playValues(0, 0)
			},
			start: function () {
				if (audiograph.debug) {
					console.log("Player starting")
				}
				var current = 0
				var seriesLength = data.maxLength()
				var series1 = data.getValues(0)
				var series2 = data.getValues(1)
				var next = function () {
					if (audiograph.debug) {
						console.log("Playing next value")
					}
					player.stop()
					current++
					value()
				}
				var value = function () {
					if (audiograph.debug) {
						console.log('current index in series: ' + current)
					}
					if (current < seriesLength) {
						if (audiograph.debug) {
							console.log('current value in series 1: ' + series1[current])
							console.log('current value in series 2: ' + series2[current])
						}
						var frequency1 = sonification.scale.valueToFrequency(series1[current])
						var frequency2 = sonification.scale.valueToFrequency(series2[current])
						if (audiograph.debug) {
							console.log('frequency for current value in series 1: ' + frequency1)
							console.log('frequency for current value in series 2: ' + frequency2)
						}
						player.playValues(frequency1, frequency2)
						if (audiograph.debug) {
							console.log('Value duration: ' + player.durations.value())
						}
						player.timeout = setTimeout(next, player.durations.value())
					}
				}
				if (audiograph.debug) {
					console.log('Series length: ' + seriesLength)
				}
				if (seriesLength > 0) {
					if (audiograph.debug) {
						console.log('Calling first values')
					}
					value()
				}
			},
		}

		function Series() {
			this.values = []			
		}

		Series.prototype.setValues = function (values) {
			this.values = values
		}

		Series.prototype.hasValues = function () {
			return this.values.length > 0
		}

		Series.prototype.maxValue = function () {
			if (this.hasValues()) {
				return this.values.reduce(function(a, b) {
				    return Math.max(a, b)
				});				
			} else {
				return 0
			}
		}

		Series.prototype.minValue = function () {
			if (this.hasValues()) {
				return this.values.reduce(function(a, b) {
				    return Math.min(a, b)
				});				
			} else {
				return 0
			}
		}

		var data = {
			series: [],
			setup: function (totalSeries){
				for (var index = 0; index < totalSeries; index++) {
					data.series[index] = new Series()
				}
			},
			setValues: function (values, forSeries) {
				if (forSeries < data.series.length) {
					data.series[forSeries].setValues(values)
				}
			},
			getValues: function (forSeries) {
				if (forSeries < data.series.length) {
					return data.series[forSeries].values
				}
				return [];
			},
			hasValues: function () {
				return (data.series.length > 0) && (data.series[0].values.length > 0)
			},
			maxValue: function () {
				if (data.hasValues()) {
					return data.series.reduce(function(a, b) {
						return Math.max(a.maxValue(), b.maxValue())
					})
				} else {
					return 0	
				}
			},
			minValue: function () {
				if (data.hasValues()) {
					return data.series.reduce(function(a, b) {
						return Math.min(a.minValue(), b.minValue())
					})
				} else {
					return 0	
				}
			},
			maxLength: function () {
				if (data.hasValues()) {
					return data.series.reduce(function(a, b) {
						return Math.max(a.values.length, b.values.length)
					})
				} else {
					return 0	
				}
			},
		}

		audiograph.ui = function (selector) {
			var element = document.getElementById(selector)

			if (audiograph.debug) {
				console.log("Found " + selector)
				console.log(element)
			}

			var createButton = function (text, handler) {
				var button = document.createElement("button")
				button.innerText = text
				button.addEventListener("click", handler)
				return button
			}

			var createLabel = function (text, forField) {
				var label = document.createElement("label")
				label.setAttribute("for", forField.id)
				label.innerText = text
				return label
			}

			var createCheckbox = function (id, checked, handler) {
				var checkbox = document.createElement("input")
				checkbox.id = id
				checkbox.type = "checkbox"
				checkbox.checked = checked
				checkbox.addEventListener("change", handler)
				return checkbox
			}

			var createInput = function (id, value, type, handler) {
				var input = document.createElement("input")
				input.id = id
				input.type = type
				input.value = value
				input.addEventListener("change", handler)
				return input
			}

			var createRadios = function (inContainer, name, labels, values, handler) {
				var counter = 0
				var first = null
				for (counter = 0; counter < labels.length; counter++) {
					var radioContainer = createContainer({className: "radio"})
					var input = createInput(name + '_' + values[counter], values[counter], "radio", function (event) {
						handler(event.target)
					})
					input.name = name
					var label = createLabel(labels[counter], input)
					radioContainer.appendChild(input)
					radioContainer.appendChild(label)
					inContainer.appendChild(radioContainer)
					if (first == null) {
						first = input
					}
				}
				if (first != null) {
					first.click()
				}
			}

			var createContainer = function (args) {
				var container = document.createElement("div")
				if (args) {
					if (args.id) {
						container.id = args.id
					}
					if (args.className) {
						container.setAttribute("class", args.className)
					}
					if (args.title) {
						var title = document.createElement("div")
						title.innerText = args.title
						title.setAttribute("class", "container-title")
						container.appendChild(title)
					}
					if (args.elements && args.elements.length && args.elements.length > 0) {
						args.elements.forEach(function (element) {
							container.appendChild(element)
						})
					}
				}
				return container
			}

			var inputAbsoluteMin = createInput("scale-min", sonification.scale.absolute.min, "number", function () {
				sonification.scale.absolute.min = inputAbsoluteMin.value
			})

			var inputAbsoluteMax = createInput("scale-max", sonification.scale.absolute.max, "number", function () {
				sonification.scale.absolute.max = inputAbsoluteMax.value
			})

			var scaleMinLabel = createLabel("Minimum value of absolute scale:", inputAbsoluteMin)
			var scaleMaxLabel = createLabel("Maximum value of absolute scale:", inputAbsoluteMax)

			var scaleContainer = createContainer({className: "scale-absolute", elements: [
				scaleMinLabel, 
				inputAbsoluteMin,
				scaleMaxLabel,
				inputAbsoluteMax,
				]})

			var updateScaleContainerVisibility = function () {
				scaleContainer.style.display = (sonification.scale.isAbsolute ? "block" : "none")
			}

			updateScaleContainerVisibility()

			var checkboxIsAbsolute = createCheckbox("scale-type-absolute", sonification.scale.isAbsolute, function () {
				sonification.scale.isAbsolute = checkboxIsAbsolute.checked
				updateScaleContainerVisibility()
			})

			var checkboxLabel = createLabel("Use absolute scale", checkboxIsAbsolute)

			var checkboxContainer = createContainer({className: "scale", elements: [
				checkboxIsAbsolute,
				checkboxLabel,
				scaleContainer,
			]})
			
			var inputDuration = createInput("duration", player.durations.total, "range", function () {
				player.durations.total = inputDuration.valueAsNumber
				instrument.setParamValue('/instrument/envelop_duration', player.durations.valueForInstrument())
				if (audiograph.debug) {
					console.log("Event duration: " + player.durations.value())
					console.log("Event duration for instrument: " + instrument.getParamValue('/instrument/envelop_duration'))
				}
			})
			inputDuration.setAttribute("min", player.durations.min)
			inputDuration.setAttribute("max", player.durations.max)
			inputDuration.setAttribute("step", 1)
			inputDuration.value = player.durations.total

			var durationLabel = createLabel("Audiograph duration (from " + player.durations.min + " to " + player.durations.max + " milliseconds)", inputDuration)

			var inputMinFreq = createInput("freq-min", sonification.scale.frequency.min, "range", function () {
				if (inputMinFreq.valueAsNumber > inputMaxFreq.valueAsNumber) {
					inputMinFreq.valueAsNumber = inputMaxFreq.valueAsNumber - 1
				}
				sonification.scale.frequency.min = inputMinFreq.valueAsNumber
			})
			inputMinFreq.setAttribute("min", sonification.scale.frequency.min)
			inputMinFreq.setAttribute("max", sonification.scale.frequency.max)
			inputMinFreq.setAttribute("step", 1)
			inputMinFreq.value = sonification.scale.frequency.min

			var inputMaxFreq = createInput("freq-max", sonification.scale.frequency.max, "range", function () {
				if (inputMaxFreq.valueAsNumber < inputMinFreq.valueAsNumber) {
					inputMaxFreq.valueAsNumber = inputMinFreq.valueAsNumber - 1
				}
				sonification.scale.frequency.max = inputMaxFreq.valueAsNumber
			})
			inputMaxFreq.setAttribute("min", sonification.scale.frequency.min)
			inputMaxFreq.setAttribute("max", sonification.scale.frequency.max)
			inputMaxFreq.setAttribute("step", 1)
			inputMaxFreq.value = sonification.scale.frequency.max

			var minFreqLabel = createLabel("Minimum frequency (from " + sonification.scale.frequency.min + "Hz to " + sonification.scale.frequency.max + "Hz)", inputMinFreq)
			var maxFreqLabel = createLabel("Maximum frequency (from " + sonification.scale.frequency.min + "Hz to " + sonification.scale.frequency.max + "Hz)", inputMaxFreq)

			var modeContainer = createContainer({className: "mode", elements: [
				createButton("Set audiograph mode to discrete", player.setDiscreteMode),
				createButton("Set audiograph mode to continuous", player.setContinuousMode),
				durationLabel,
				inputDuration,
				minFreqLabel,
				inputMinFreq,
				maxFreqLabel,
				inputMaxFreq,
			]})

			var createTimbreSlider = function (instrumentParam) {
				var slider = createInput("timbre-" + instrumentParam, 100, "range", function () {
					var value = slider.valueAsNumber / 100
					instrument.setParamValue('/instrument/' + instrumentParam, value)
					if (audiograph.debug) {
						console.log("/instrument/" + instrumentParam + " is now: " + instrument.getParamValue('/instrument/' + instrumentParam))
					}
				})
				slider.setAttribute("min", 0)
				slider.setAttribute("max", 100)
				slider.setAttribute("step", 1)
				return slider
			}

			var volumeSlider = createTimbreSlider("volume")
			var volumeLabel = createLabel("Volume", volumeSlider)
			var brightnessSlider = createTimbreSlider("brightness")
			var brightnessLabel = createLabel("Brightness", brightnessSlider)
			var reverbSlider = createTimbreSlider("reverb")
			var reverbLabel = createLabel("Reverb", reverbSlider)

			var timbreType_1Container = createContainer({className: "radios", title: "Type of sound for Series 1"})
			createRadios(timbreType_1Container, 
				"type_1",
				["Sound 1", "Sound 2", "Sound 3"],
				[1, 2, 3],
				function (radio) {
					instrument.setParamValue("/instrument/type_1", radio.value)
					if (audiograph.debug) {
						console.log("/instrument/type_1 is now: " + instrument.getParamValue('/instrument/type_1'))
					}
				},
			)

			var timbreType_2Container = createContainer({className: "radios", title: "Type of sound for Series 2"})
			createRadios(timbreType_2Container, 
				"type_2",
				["Sound 1", "Sound 2", "Sound 3"],
				[1, 2, 3],
				function (radio) {
					instrument.setParamValue("/instrument/type_2", radio.value)
					if (audiograph.debug) {
						console.log("/instrument/type_2 is now: " + instrument.getParamValue('/instrument/type_2'))
					}
				},
			)

			var timbreContainer = createContainer({className: "timbre", elements: [
				volumeLabel,
				volumeSlider,
				brightnessLabel,
				brightnessSlider,
				reverbLabel,
				reverbSlider,
				timbreType_1Container,
				timbreType_2Container,
			]})

			var toggleTimbreContainerVisibility = function () {
				timbreContainer.style.display = (timbreContainer.style.display == "none") ? "block" : "none"	
			}

			toggleTimbreContainerVisibility()
			
			var controlContainer = createContainer({className: "control", elements: [
				createButton("Play audiograph", sonification.callback),
				createButton("Stop audiograph", player.stop),
				createButton("Timbre", toggleTimbreContainerVisibility),
				timbreContainer,
			]})

			element.appendChild(controlContainer)
			element.appendChild(modeContainer)
			element.appendChild(checkboxContainer)
		}

		audiograph.start = function (playOnStart) {
			faust.default.createinstrument(audio_context, 1024, 
				function (node) {
					instrument = node
					if (audiograph.debug) {
						console.log("Faust DSP params:")
			            console.log(instrument.getParams())
					}
		            instrument.connect(audio_context.destination)
		            data.setup(2)
		            console.log("playOnStart is:")
		            console.log(playOnStart)
		            if (playOnStart) {
		            	sonification.callback()
		            }
				})
		}

		audiograph.setValues = function (values, forSeries) {
			if (audiograph.debug) {
				console.log("Setting values to:")
				console.log(values)
			}
			data.setValues(values, forSeries)
		}

		audiograph.play = sonification.callback
		audiograph.stop = player.stop

		audiograph.initialized = true
	})
}


