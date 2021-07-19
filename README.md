<p align="center">
<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

## Homebridge Plugin for the Netatmo Rain Sensor
This Homebridge Plugin makes the Netatmo Rain Sensor accessible to HomeKit as a Switch.
This makes it possible to use the Netatmo Rain Sensor for all kinds of automations based on rain detection.

## Important Notes
There are a couple of limitations to the Netatmo Rain Sensor and its respective API that you should be aware of. These are **_not_** limitations of this plugin:
* The Netatmo API is updated in 10-minute intervals.
  * This means that in the worst case this plugin detects rain with a 10-minute delay.
* The rain information is accumulated for 30 minutes.
  *  This means that this plugin will report rain for at least 30 minutes even if it just rained for e.g. 5 minutes.
* It is not allowed to poll the Netatmo API too frequently.
  * Therefore the minimum polling interval for this plugin is 1 minute to ensure you comply with the Netatmo rules. 

## Installation
In Homebridge switch to the Plugins tab. Enter `homebridge-plugin-netatmo-rain-sensor` in the search box. Click Install.

## Plugin Configuration in Homebridge
The configuration is simplified as much as possible and comes with default values that give the fastest possible rain detection.

The main caveat in the configuration is that you need to be registered as a developer at https://dev.netatmo.com/. It is free of charge and basically elevates your existing Netatmo account to a developer account. You need this to obtain your "Client ID" and "Client Secret".

Note that right now only one Netatmo Rain Sensor is supported so it does not make sense to add multiple accessories of this type.

## Additional Information
HomeKit does not support rain sensors natively right now. Therefore your Netatmo rain sensor is shown as "unsupported" in the Home App and cannot be used for automations. This is a little sad because rain detection can be the trigger for all kinds of meaningful automations.

This plugin basically "wraps" the Netatmo Rain Sensor in the form of a Switch which is a device category natively supported by HomeKit. The trigger "Switch On" can now act as a starting point for automations.

The way this works is that this plugin polls the Netatmo API periodically in the background and triggers the "Switch On" status when rain was detected by the sensor.