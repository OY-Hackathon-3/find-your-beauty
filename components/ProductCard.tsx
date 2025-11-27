import React from 'react';
import { Product } from '../types';
import { ExternalLink } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  index: number;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, index }) => {
  return (
      <div
          className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neon-500/50 transition-all duration-300 hover:transform hover:-translate-y-1 group flex flex-col h-full"
          style={{ animationDelay: `${index * 150}ms` }}
      >
        {/* Product Image */}
        <div className="relative aspect-square overflow-hidden bg-white p-4">
          <img
              src={product.thumbnailUrl}
              alt={product.name}
              className="w-full h-full object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute top-2 right-2 bg-neon-900/90 text-neon-400 text-xs font-bold px-2 py-1 rounded backdrop-blur-sm border border-neon-500/20">
            ${product.price.toFixed(2)}
          </div>
        </div>

        <div className="p-5 flex flex-col flex-grow">
          <h3 className="text-base font-bold text-white mb-2 line-clamp-2 leading-tight min-h-[2.5rem]" title={product.name}>
            {product.name}
          </h3>

          <p className="text-gray-400 text-sm mb-4 line-clamp-2 flex-grow">
            {product.description}
          </p>

          <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto flex items-center justify-between w-full px-4 py-2 bg-neutral-800 hover:bg-neon-600 hover:text-white text-gray-300 rounded-lg transition-all text-sm font-medium border border-transparent hover:border-neon-400 shadow-lg"
          >
            <span>Buy Now</span>
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
  );
};

export default ProductCard;
