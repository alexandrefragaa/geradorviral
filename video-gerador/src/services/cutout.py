"""
Recorta o personagem da imagem (remove o fundo), deixando um PNG transparente.
Uso: python3 cutout.py <caminho_entrada> <caminho_saida>
"""
import sys
from rembg import remove
from PIL import Image

def main():
    if len(sys.argv) != 3:
        print("uso: python3 cutout.py <entrada> <saida>", file=sys.stderr)
        sys.exit(1)

    entrada, saida = sys.argv[1], sys.argv[2]
    imagem = Image.open(entrada)
    resultado = remove(imagem)
    resultado.save(saida)
    print(saida)

if __name__ == "__main__":
    main()
