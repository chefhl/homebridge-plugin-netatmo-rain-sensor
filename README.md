<p align="center">
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

## Homebridge Plugin for the Netatmo Rain Sensor
This Homebridge Plugin makes the Netatmo Rain Sensor accessible to HomeKit as a Leak Sensor.
This makes it possible to use the Netatmo Rain Sensor for all kinds of automations based on rain detection.

## Important Notes
There are a couple of limitations to the Netatmo Rain Sensor and its respective API that you should be aware of. These are *not* limitations of this plugin:
* The Netatmo API is updated in 10-minute intervals.
  * This means that in the worst case this plugin detects rain with a 10-minute delay.
* The rain information is accumulated for 30 minutes.
  *  This means that this plugin will report rain for at least 30 minutes even if it just rained for e.g. 5 minutes.

## Plugin Configuration in Homebridge
TODO

## Developer Info
TODO