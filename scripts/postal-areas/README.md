# Postal code maps

`src/assets/postal-areas/<CC>.json` hold the maps on which organizers choose the region of
their bazaar (#304): areas of the first three digits of the postal code, the regions of the
first two digits, the country's outline and its larger towns. The app draws them as plain
SVG, without map tiles, so no third party learns who looks at the map.

## Sources

| Data                        | Source                                                                                              | Licence                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Postal code areas, Germany  | OpenStreetMap via [yetzt/postleitzahlen](https://github.com/yetzt/postleitzahlen) (release 2026.02) | [ODbL](https://opendatacommons.org/licenses/odbl/), © OpenStreetMap contributors |
| Postal codes AT, CH, LI, LU | [GeoNames postal codes](https://download.geonames.org/export/zip/); areas are Voronoi cells         | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © GeoNames            |
| Country outlines            | [Natural Earth](https://www.naturalearthdata.com/) admin 0 countries, 10m                           | public domain                                                                    |
| Towns                       | [GeoNames cities15000](https://download.geonames.org/export/dump/)                                  | CC BY 4.0, © GeoNames                                                            |

The map names its source in the corner.

## Rebuilding

```sh
mkdir -p /tmp/postal && cd /tmp/postal
curl -LO https://github.com/yetzt/postleitzahlen/releases/download/2026.02/postleitzahlen.geojson.br
python3 -c "import brotli; open('plz.geojson','wb').write(brotli.decompress(open('postleitzahlen.geojson.br','rb').read()))"
for c in AT CH LI LU; do curl -LO https://download.geonames.org/export/zip/$c.zip && unzip -o $c.zip -d $c; done
curl -LO https://download.geonames.org/export/dump/cities15000.zip && unzip -o cities15000.zip
curl -Lo ne_countries.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson

python3 -m venv venv && venv/bin/pip install shapely brotli
venv/bin/python <repo>/scripts/postal-areas/build.py /tmp/postal <repo>/src/assets/postal-areas
```

Coordinates are Web Mercator units (`R = 63710` per radian, 100 m at the equator), as
`src/lib/postalMap.ts` expects them.
