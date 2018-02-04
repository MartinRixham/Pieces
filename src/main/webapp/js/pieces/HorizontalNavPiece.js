define(["./Placeholder"], function NavPiece(Placeholder) {

	function NavPiece(pages) {

		var self = this;

		var currentIndex = new Datum(0);

		var activeIndex = new Datum(-1);

		var container = null;

		var right = true;

		var slideRef = {};

		this.firstPage = pages[0].page;

		this.secondPage = null;

		(function routePage(self) {

			for (var i = 0; i < pages.length; i++) {

				if ("#" + pages[i].route == location.hash) {

					self.firstPage = pages[i].page;
					currentIndex(i);
				}
			}
		})(this);

		this.onBind = function(element) {

			element.style.overflow = "hidden";

			container = document.createElement("DIV");
			container.style.width = "200%";
			container.style.position = "relative";
			container.style.transition = "left 0.5s linear";
			container.style.left = "0";

			var firstElement = document.createElement("DIV");
			firstElement.dataset.bind = "firstPage";
			firstElement.style.display = "inline-block";
			firstElement.style.width = "50%";

			var secondElement = document.createElement("DIV");
			secondElement.dataset.bind = "secondPage";
			secondElement.style.display = "inline-block";
			secondElement.style.width = "50%";

			container.appendChild(firstElement);
			container.appendChild(secondElement);

			element.appendChild(container);
		};

		this.showPage = function(index) {

			var ref = {};

			slideRef = ref;

			if (!pages[index]) {

				return;
			}

			var oldPage;

			if (index > currentIndex()) {

				container.style.removeProperty("transition");
				container.style.left = "0";

				if (!right) {

					oldPage = getOldPage(1);

					this.firstPage = new Placeholder(oldPage);
				}

				this.secondPage = pages[index].page;

				right = false;

				setTimeout(function() {

					container.style.transition = "left 0.5s linear";
					container.style.left = "-100%";

					setTimeout(function() {

						if (slideRef == ref) {

							self.firstPage = null;
						}
					}, 500);
				});
			}
			else if (index < currentIndex()) {

				container.style.removeProperty("transition");
				container.style.left = "-100%";

				if (right) {

					oldPage = getOldPage(0);

					this.secondPage = new Placeholder(oldPage);
				}

				this.firstPage = pages[index].page;

				right = true;

				setTimeout(function() {

					container.style.transition = "left 0.5s linear";
					container.style.left = "0";

					setTimeout(function() {

						if (slideRef == ref) {

							self.secondPage = null;
						}
					}, 500);
				});
			}

			currentIndex(index);
			activeIndex(index);

			location.hash = pages[index].route;
		};

		function getOldPage(index) {

			var children = container.children[index].children;
			var oldPage = new Array(children.length);

			for(var i = children.length - 1; i >= 0; i--) {

				oldPage[i] = children[i];
				container.children[index].removeChild(children[i]);
			}

			return oldPage;
		}

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});