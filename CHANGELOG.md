## Version History
+ 2.2.0: It is now possible to specify the serial number of a specific rain sensor. Thus multiple rain sensors can be tracked as well.
+ 2.1.0: It is now possible to configure if the Netatmo Rain Sensor is represented as a Switch or a Leak Sensor in HomeKit with "Switch" being the default.
+ 2.0.0: Changed the Netatmo Rain Sensor representation to "Switch" to prevent iOS integrated "Leak Sensor" alerts. Introduced a configurable "Cooldown perdiod" to prevent API polling and rain detection for a certain amount of time after rain was detected.
+ 1.0.6: First stable release that represents the Netatmo Rain Sensor as a "Leak Sensor".