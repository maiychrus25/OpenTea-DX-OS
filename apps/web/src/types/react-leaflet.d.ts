declare module 'react-leaflet' {
  // @ts-ignore: Dùng any tạm thời do thư viện react-leaflet thiếu type definition chuẩn hoặc không tương thích Next.js SSR
  import * as React from 'react'
  export const MapContainer: React.ComponentType<any>
  export const TileLayer: React.ComponentType<any>
  export const Marker: React.ComponentType<any>
  export const Popup: React.ComponentType<any>
  export const GeoJSON: React.ComponentType<any>
  export const LayersControl: React.ComponentType<any> & {
    BaseLayer: React.ComponentType<any>;
    Overlay: React.ComponentType<any>;
  }
  export const useMap: () => any
  export default {} as any
}
