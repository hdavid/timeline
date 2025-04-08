# Timeline

Build a timeline of your life or other things using D3.js.


## Usage
start the local webServer 
  ```bash
    ./server.sh
  ```

## Configuration
[config.json](data/example/config.json)

## Data Format
The data is in JSON format. Each entry should have a date and a description. The date should be in ISO 8601 format (YYYY-MM-DD). The description can be any string.

```json
  [
    { "name": "Name",  "start": "2011-04-01", "end": "2020-09-01", "description": "some decription",  "team": "My Team", "type": "manager"}
  ]
```

- name: Name of the item
- start: start date
- end: end date
- description: description
- properties: all other properties that are not used for grouping. 
- groups: all propeties that are used for visual grouping. they should be defined 

see example [missions.json](data/example/missions.json)

## Styling

The timeline is styled using CSS. You can customize the colors, fonts, and other styles in the `style.css` file.
following the format `<type>-<value> { CSS }`

see [style.css](data/example/style.css)